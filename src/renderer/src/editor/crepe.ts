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
import { $prose } from '@milkdown/kit/utils'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
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
   * True while the document holds edits the listener has not yet reported.
   *
   * The listener is debounced — serializing a large document on every
   * keystroke would be the most expensive thing on the typing path — so the
   * document store lags the screen by that window. Anything that *decides*
   * from the store (save, close, quit, switching to source mode) has to flush
   * first, or it acts on text without the last keystrokes. Measured: Ctrl+S
   * straight after typing wrote the file without them.
   */
  let pending = false

  const crepe = new Crepe({
    root: opts.root,
    defaultValue: opts.value,
    features: {
      // An LLM integration we do not want.
      [CrepeFeature.AI]: false,
      [CrepeFeature.TopBar]: false,
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
    .use(listener)
    .use(frontmatterPlugin)
    .use(tocPlugin)
    .use(mermaidPlugin)
    .use(searchPlugin)
    .use(typewriterPlugin)
    .use(punctuationPlugin)
    .use(whitespacePlugin)
    .use(
      // Marks edits the debounced listener has not reported yet. See `flush`.
      $prose(
        () =>
          new Plugin({
            view: () => ({
              update: (view, prev) => {
                if (!prev.doc.eq(view.state.doc)) pending = true
              },
            }),
          })
      )
    )
    .config((ctx) => {
      ctx.get(listenerCtx).markdownUpdated((c, markdown, prevMarkdown) => {
        pending = false
        if (markdown === prevMarkdown) return
        opts.onChange(withoutTrailingParagraph(markdown, c.get(editorViewCtx).state.doc))
      })
    })

  await crepe.create()
  if (opts.readonly) crepe.setReadonly(true)

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

  const flush = (): void => {
    // Only when there is something unreported. Serializing unconditionally
    // would mark a clean document dirty whenever its file does not round-trip
    // byte for byte, which the guard already warns about.
    if (!pending) return
    pending = false
    opts.onChange(currentMarkdown())
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
    setReadonly: (v: boolean) => void crepe.setReadonly(v),
    destroy: async () => {
      // Every way an editor goes away — eviction, a reload, leaving source
      // mode — passes through here, so this is the one place its unreported
      // edits are guaranteed to be handed over first.
      flush()
      detachImages()
      await crepe.destroy()
    },
  }
}
