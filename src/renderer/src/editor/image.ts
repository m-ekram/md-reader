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
import { imageBlockSchema } from '@milkdown/kit/component/image-block'
import type { NodeSchema } from '@milkdown/transformer'

export function applyImageAltFix(ctx: Ctx): void {
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
          src: node.attrs.src,
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
