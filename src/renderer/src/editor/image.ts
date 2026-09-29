/**
 * Repairs image-block's markdown handling.
 *
 * The upstream feature stores the image's resize ratio *in the alt slot*: it
 * parses `alt` as a number and serializes `alt` back as `ratio.toFixed(2)`. So
 * `![alt text](p.png)` is written back as `![1.00](p.png)` and every block
 * image loses its alt text the first time the file is saved. Phase 0 measured
 * this; it is silent content and accessibility loss.
 *
 * The fix keeps alt text as alt text. The ratio becomes session-only state:
 * resizing still works while the document is open, but it is not written to the
 * file. That is the right way round — alt text is the user's content, a resize
 * handle is presentation, and markdown has no standard way to express the
 * latter. Trading content for presentation is never the correct trade.
 *
 * Applied by replacing the schema in its own ctx slice rather than with
 * `extendSchema`, which would register a second schema under the same id and
 * collide with Crepe's own registration.
 */
import type { Ctx } from '@milkdown/kit/ctx'
import { imageBlockConfig, imageBlockSchema } from '@milkdown/kit/component/image-block'
import { inlineImageConfig } from '@milkdown/kit/component/image-inline'
import { imageSchema } from '@milkdown/kit/preset/commonmark'
import type { NodeSchema } from '@milkdown/transformer'
import { resolveAssetSrc } from './assets'

/**
 * Makes relative image links display.
 *
 * The page is loaded from the application bundle, so `assets/pic.png` resolves
 * against `out/renderer/` and the image fails to load. Resolution happens only
 * in `toDOM`: the markdown keeps the relative link, which is what makes a notes
 * folder portable between machines.
 */
export function applyImageSrcResolution(ctx: Ctx, documentDir: () => string | null): void {
  // The block image is drawn by a node view, not by `toDOM`, so overriding the
  // schema's rendering has no effect on it. `proxyDomURL` is the component's
  // own hook for exactly this: it transforms the URL used for display and
  // leaves the stored attribute alone.
  ctx.update(imageBlockConfig.key, (prev) => ({
    ...prev,
    proxyDomURL: (url: string) => resolveAssetSrc(url, documentDir()),
  }))
  // An image inside a line of text has its own view, and its own hook. A
  // pasted image is one of these: without it, it showed broken until the file
  // was opened again, when it became a block image.
  ctx.update(inlineImageConfig.key, (prev) => ({
    ...prev,
    proxyDomURL: (url: string) => resolveAssetSrc(url, documentDir()),
  }))

  const key = imageSchema.key
  const base = ctx.get(key)

  ctx.set(key, (c: Ctx): NodeSchema => {
    const schema = base(c)
    return {
      ...schema,
      toDOM: (node) => [
        'img',
        {
          src: resolveAssetSrc(String(node.attrs.src ?? ''), documentDir()),
          alt: node.attrs.alt ?? '',
          title: node.attrs.title ?? '',
        },
      ],
    }
  })
}

export function applyImageAltFix(ctx: Ctx, documentDir: () => string | null): void {
  const key = imageBlockSchema.key
  const base = ctx.get(key)

  ctx.set(key, (c: Ctx): NodeSchema => {
    const schema = base(c)

    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        // Real alt text, no longer a numeric side-channel.
        alt: { default: '', validate: 'string' },
      },
      parseDOM: [
        {
          tag: 'img[data-type="image-block"]',
          getAttrs: (dom: HTMLElement | string) => {
            if (typeof dom === 'string') return {}
            return {
              src: dom.getAttribute('src') ?? '',
              caption: dom.getAttribute('caption') ?? '',
              alt: dom.getAttribute('alt') ?? '',
              ratio: Number(dom.getAttribute('ratio') ?? 1) || 1,
            }
          },
        },
      ],
      toDOM: (node) => [
        'img',
        {
          'data-type': 'image-block',
          // Resolved for display only; the markdown keeps the relative path.
          src: resolveAssetSrc(String(node.attrs.src ?? ''), documentDir()),
          caption: node.attrs.caption,
          alt: node.attrs.alt,
          ratio: node.attrs.ratio,
        },
      ],
      parseMarkdown: {
        match: ({ type }) => type === 'image-block',
        runner: (state, node, type) => {
          state.addNode(type, {
            src: (node.url as string) ?? '',
            caption: (node.title as string) ?? '',
            alt: (node.alt as string) ?? '',
            // Not read from the file: the ratio lives only for this session.
            ratio: 1,
          })
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === 'image-block',
        runner: (state, node) => {
          state.openNode('paragraph')
          state.addNode('image', undefined, undefined, {
            title: node.attrs.caption || undefined,
            url: node.attrs.src,
            alt: node.attrs.alt ?? '',
          })
          state.closeNode()
        },
      },
    }
  })
}
