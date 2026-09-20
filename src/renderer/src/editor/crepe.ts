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
import { parserCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { frontmatterPlugin } from './frontmatter'
import { applyImageAltFix } from './image'
import { applyAlerts } from './alerts'
import { tocPlugin } from './toc'

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
  /** Parses then re-serializes without touching the document, for the guard. */
  reserialize(markdown: string): string
  setReadonly(v: boolean): void
  destroy(): Promise<void>
}

export async function createEditor(opts: {
  root: HTMLElement
  value: string
  readonly?: boolean
  onChange(markdown: string): void
}): Promise<EditorHandle> {
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
      applyImageAltFix(ctx)
      applyAlerts(ctx)
    })
    .use(listener)
    .use(frontmatterPlugin)
    .use(tocPlugin)
    .config((ctx) => {
      ctx.get(listenerCtx).markdownUpdated((_c, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) opts.onChange(markdown)
      })
    })

  await crepe.create()
  if (opts.readonly) crepe.setReadonly(true)

  return {
    crepe,
    getMarkdown: () => crepe.getMarkdown(),
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
    destroy: async () => void (await crepe.destroy()),
  }
}
