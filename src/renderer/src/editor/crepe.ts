/**
 * Editor construction.
 *
 * Two Phase 0 findings are encoded here, and both matter enough to state plainly:
 *
 *  1. Serializer options must be applied BEFORE `create()`. The remark instance
 *     is built during init, so configuring afterwards silently does nothing —
 *     the kind of bug that looks like the options are simply ignored.
 *
 *  2. `image-block` is enabled, but only with the alt-text repair in
 *     `./image.ts` applied. Upstream it writes the image's width ratio into the
 *     alt slot, destroying alt text on first save. Never enable it without that
 *     override.
 */
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import {
  editorViewCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin } from '@milkdown/kit/prose/state'
import { listener } from '@milkdown/kit/plugin/listener'
import { $prose } from '@milkdown/kit/utils'
import { frontmatterPlugin } from './frontmatter'
import { applyImageAltFix, applyImageSrcResolution } from './image'
import { directoryOf } from './assets'
import { applyAlerts } from './alerts'
import { tocPlugin } from './toc'
import { mermaidPlugin } from './mermaid'
import { attachImageHandlers } from './paste'
import { searchPlugin } from './find'
import { typewriterPlugin } from './typewriter'
import { punctuationPlugin } from './punctuation'
import { whitespacePlugin } from './whitespace'
import { mark } from '../utils/startup'
import { codeTheme } from './code-theme'
import { labelTopBar } from './toolbar'
import { historyClock } from './history-clock'

/**
 * Drops the newline the trailing plugin's empty paragraph adds.
 *
 * Crepe appends an empty paragraph to any document that ends in something
 * other than a heading or paragraph — a list, a code block, a table, a quote —
 * so the caret has somewhere to go after it. It does so on the first
 * transaction of any kind, a click included, and that paragraph serializes as
 * one extra newline. So a file ending in a list was modified merely by being
 * opened: it prompted to save on close, and saving rewrote it.
 *
 * The paragraph stays, because it is how the user types after a final table.
 * It just is not content: markdown cannot express an empty paragraph, so it
 * contributes nothing to the file. Measured: exactly one newline, for every
 * block type that triggers it.
 */
export function withoutTrailingParagraph(markdown: string, doc: ProseNode): string {
  const last = doc.lastChild
  const appended = doc.childCount > 1 && last?.type.name === 'paragraph' && last.content.size === 0
  return appended && markdown.endsWith('\n\n') ? markdown.slice(0, -1) : markdown
}

/**
 * Names the block handle's two buttons.
 *
 * Crepe draws them as bare icons — a plus, and six dots — and the dots, which
 * drag the block, looked like a button that did nothing when clicked. Crepe
 * renders the add button first and the drag handle second. The handle is created
 * lazily, so this watches for it rather than assuming it already exists.
 *
 * Returns a function that stops watching.
 */
function labelBlockHandle(root: HTMLElement): () => void {
  const apply = (): boolean => {
    const items = root.querySelectorAll<HTMLElement>('.milkdown-block-handle .operation-item')
    if (items.length < 2) return false
    items[0].title = 'Add a block'
    items[1].title = 'Drag to move this block'
    return true
  }
  if (apply()) return () => {}
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect()
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/**
 * How long a pause in typing before edits are reported to the store.
 *
 * Each report serialises the whole document. The same 200 ms Milkdown's
 * listener used: a longer pause (600 ms) was measured with
 * `npm run bench:typing`, at 120 and 250 ms between keys, and made no
 * difference to typing latency, only to how soon the store caught up.
 * Anything that needs the text sooner calls `flush`.
 */
const REPORT_AFTER_MS = 200

/**
 * Emit conventional markdown, so re-serializing an ordinary file is close to a
 * no-op rather than a reformat. Worth six constructs on its own, measured.
 */
export const SERIALIZER_OPTIONS = {
  bullet: '-' as const,
  rule: '-' as const,
  emphasis: '*' as const,
  strong: '*' as const,
  fence: '`' as const,
  fences: true,
  listItemIndent: 'one' as const,
  setext: false,
  tightDefinitions: true,
}

export interface EditorHandle {
  crepe: Crepe
  getMarkdown(): string
  /** Reports any edits the debounced listener has not reported yet. Synchronous. */
  flush(): void
  /** Parses then re-serializes without touching the document, for the guard. */
  reserialize(markdown: string): string
  setReadonly(v: boolean): void
  destroy(): Promise<void>
}

export async function createEditor(opts: {
  root: HTMLElement
  value: string
  readonly?: boolean
  /** The document's path, so relative image links can be displayed. */
  documentPath?: string | null
  onChange(markdown: string): void
}): Promise<EditorHandle> {
  const documentDir = directoryOf(opts.documentPath ?? null)

  /**
   * True while the document holds edits not yet reported to the store.
   *
   * Edits are reported once the user pauses (REPORT_AFTER_MS), because each
   * report serialises the whole document, so the document store lags the
   * screen by that window. Anything that *decides* from the store (save,
   * close, quit, switching to source mode) has to flush first, or it acts on
   * text without the last keystrokes. Measured: Ctrl+S straight after typing
   * wrote the file without them.
   */
  let pending = false
  let reportTimer: ReturnType<typeof setTimeout> | undefined
  /** What was last reported; to begin with, the document as opened. */
  let lastReported: string | null = null
  let openedDoc: ProseNode | null = null
  /**
   * Readonly, enforced on the document itself. Crepe's readonly only stops
   * typing: commands change the document directly, so a shortcut could make a
   * Help page bold and then ask whether to save it.
   */
  let readonly = opts.readonly === true

  const crepe = new Crepe({
    root: opts.root,
    defaultValue: opts.value,
    features: {
      // An LLM integration we do not want.
      [CrepeFeature.AI]: false,
      // Always built; View > Toolbar shows or hides it. See toolbar.ts.
      [CrepeFeature.TopBar]: true,
    },
    featureConfigs: {
      // Colours from the theme, not Crepe's fixed dark palette. See code-theme.ts.
      [CrepeFeature.CodeMirror]: { theme: codeTheme },
    },
  })

  crepe.editor
    .config((ctx) => {
      const prev = ctx.get(remarkStringifyOptionsCtx)
      ctx.set(remarkStringifyOptionsCtx, { ...prev, ...SERIALIZER_OPTIONS })
      applyImageAltFix(ctx, documentDir)
      applyImageSrcResolution(ctx, documentDir)
      applyAlerts(ctx)
    })
    .use(frontmatterPlugin)
    .use(tocPlugin)
    .use(mermaidPlugin)
    .use(searchPlugin)
    .use(typewriterPlugin)
    .use(punctuationPlugin)
    .use(whitespacePlugin)
    // Undo steps by the time that passed, not the wall clock. See history-clock.ts.
    .use($prose(() => historyClock()))
    // Refuses any change to a readonly document, whoever asks for it.
    .use($prose(() => new Plugin({ filterTransaction: (tr) => !(readonly && tr.docChanged) })))
    .use(
      // Marks unreported edits, and reports them once the user pauses.
      $prose(
        () =>
          new Plugin({
            view: () => ({
              update: (view, prev) => {
                if (prev.doc.eq(view.state.doc)) return
                pending = true
                clearTimeout(reportTimer)
                reportTimer = setTimeout(flush, REPORT_AFTER_MS)
              },
            }),
          })
      )
    )

  // Crepe installs Milkdown's change listener, which serialises the whole
  // document as the editor is created and after every pause. Changes are
  // reported by the plugin above instead, so it only cost time: without it, a
  // 10,000-line file opened about 350 ms sooner (bench:typing, 3 runs each).
  await crepe.editor.remove(listener)
  await crepe.create()
  mark('editorReady')
  crepe.editor.action((ctx) => {
    openedDoc = ctx.get(editorViewCtx).state.doc
  })
  // The baseline for "has this changed?", taken while the user is still
  // reading rather than at their first pause in typing.
  // Electron has requestIdleCallback; the unit tests' DOM does not. Cancelled
  // on destroy: an editor evicted before the idle moment has no serializer.
  const cancelBaseline: () => void =
    typeof requestIdleCallback === 'function'
      ? (
          (id) => () =>
            cancelIdleCallback(id)
        )(requestIdleCallback(() => settleBaseline(), { timeout: 3000 }))
      : (
          (id) => () =>
            clearTimeout(id)
        )(setTimeout(() => settleBaseline(), 0))
  if (opts.readonly) crepe.setReadonly(true)

  const stopLabelling = labelBlockHandle(opts.root)
  const stopLabellingToolbar = labelTopBar(opts.root)

  // Attached after create(), when the view exists.
  const detachImages = attachImageHandlers(opts.root, () => {
    let view: EditorView | null = null
    try {
      crepe.editor.action((ctx) => {
        view = ctx.get(editorViewCtx)
      })
    } catch {
      view = null
    }
    return view
  })

  /** The document as markdown, without the trailing plugin's empty paragraph. */
  const currentMarkdown = (): string => {
    let doc: ProseNode | null = null
    crepe.editor.action((ctx) => {
      doc = ctx.get(editorViewCtx).state.doc
    })
    const raw = crepe.getMarkdown()
    return doc ? withoutTrailingParagraph(raw, doc) : raw
  }

  /** The document as opened, serialised once: in idle time, or now if needed first. */
  let destroyed = false
  const settleBaseline = (): void => {
    if (destroyed || lastReported !== null || !openedDoc) return
    const doc: ProseNode = openedDoc
    crepe.editor.action((ctx) => {
      lastReported = withoutTrailingParagraph(ctx.get(serializerCtx)(doc), doc)
    })
  }

  const flush = (): void => {
    clearTimeout(reportTimer)
    // Only when there is something unreported. Serializing unconditionally
    // would mark a clean document dirty whenever its file does not round-trip
    // byte for byte, which the guard already warns about.
    if (!pending) return
    pending = false
    const markdown = currentMarkdown()
    // A change that serialises the same as before is not an edit: the trailing
    // paragraph added on the first click is one. Reporting it would mark a file
    // that does not round-trip byte for byte as edited.
    settleBaseline()
    if (markdown === lastReported) return
    lastReported = markdown
    opts.onChange(markdown)
  }

  return {
    crepe,
    getMarkdown: currentMarkdown,
    flush,
    reserialize(markdown: string) {
      let out = ''
      crepe.editor.action((ctx) => {
        const doc = ctx.get(parserCtx)(markdown)
        if (!doc) throw new Error('parser returned null')
        out = ctx.get(serializerCtx)(doc)
      })
      return out
    },
    setReadonly: (v: boolean) => {
      readonly = v
      crepe.setReadonly(v)
    },
    destroy: async () => {
      // Every way an editor goes away — eviction, a reload, leaving source
      // mode — passes through here, so this is the one place its unreported
      // edits are guaranteed to be handed over first.
      flush()
      destroyed = true
      cancelBaseline()
      stopLabelling()
      stopLabellingToolbar()
      detachImages()
      await crepe.destroy()
    },
  }
}
