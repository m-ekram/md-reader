/**
 * GitHub-style alerts (callouts).
 *
 *     > [!NOTE]
 *     > Useful information.
 *
 * Without handling, the `[` is escaped on save and the file comes back as
 * `> \[!NOTE]`, which stops it rendering as a callout anywhere else. Phase 0
 * measured that as a real loss.
 *
 * An alert is just a blockquote whose first paragraph is the marker, so this
 * extends the existing blockquote with an attribute rather than introducing a
 * node. Ordinary quotes keep working, and deleting the marker turns the alert
 * back into a plain quote with no special case.
 *
 * Applied by replacing commonmark's schema in its ctx slice; registering a
 * second schema under the id `blockquote` would collide with it.
 */
import type { Ctx } from '@milkdown/kit/ctx'
import { blockquoteSchema } from '@milkdown/kit/preset/commonmark'
import type { NodeSchema } from '@milkdown/transformer'

export const ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i

/** Reads the alert kind from a blockquote's first line, if it is a marker. */
export function alertKindOf(firstLine: string): AlertKind | null {
  const m = MARKER.exec(firstLine.trim())
  return m ? (m[1].toLowerCase() as AlertKind) : null
}

interface MdastNode {
  type: string
  children?: MdastNode[]
  value?: string
}

/**
 * The alert kind, given the blockquote's first child paragraph.
 *
 * Milkdown's remark pipeline splits the marker line from the body with an
 * explicit `break` node rather than leaving a newline inside one text node, so
 * the marker is the paragraph's first text child on its own.
 */
function markerOf(paragraph: MdastNode | undefined): AlertKind | null {
  if (paragraph?.type !== 'paragraph') return null
  const text = paragraph.children?.[0]
  if (text?.type !== 'text' || typeof text.value !== 'string') return null
  return alertKindOf(text.value.split('\n')[0])
}

export function applyAlerts(ctx: Ctx): void {
  const key = blockquoteSchema.key
  const base = ctx.get(key)

  ctx.set(key, (c: Ctx): NodeSchema => {
    const schema = base(c)

    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        /** Null for an ordinary blockquote. */
        alert: { default: null },
      },
      parseDOM: [
        {
          tag: 'blockquote',
          getAttrs: (dom: HTMLElement | string) =>
            typeof dom === 'string' ? {} : { alert: dom.getAttribute('data-alert') },
        },
      ],
      toDOM: (node) => [
        'blockquote',
        node.attrs.alert
          ? { 'data-alert': String(node.attrs.alert), class: `alert alert--${String(node.attrs.alert)}` }
          : {},
        0,
      ],
      parseMarkdown: {
        match: ({ type }) => type === 'blockquote',
        runner: (state, node, type) => {
          const children = [...((node.children ?? []) as unknown as MdastNode[])]
          const kind = markerOf(children[0])

          if (!kind) {
            state.openNode(type)
            state.next(node.children ?? [])
            state.closeNode()
            return
          }

          // The marker and the body share one paragraph, separated by a break
          // node. Strip both the marker text and that break, so the attribute
          // is the only record of the marker; leaving it in the body would
          // duplicate it on every save.
          const para = children[0]
          const rest = (para.children ?? []).slice(1)
          if (rest[0]?.type === 'break') rest.shift()

          if (rest.length > 0) children[0] = { ...para, children: rest }
          else children.shift()

          state.openNode(type, { alert: kind })
          if (children.length > 0) state.next(children as never)
          else state.addNode(state.schema.nodes.paragraph)
          state.closeNode()
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === 'blockquote',
        runner: (state, node) => {
          state.openNode('blockquote')

          if (!node.attrs.alert) {
            state.next(node.content)
            state.closeNode()
            return
          }

          const marker = `[!${String(node.attrs.alert).toUpperCase()}]`
          const first = node.content.firstChild

          if (first && first.type.name === 'paragraph') {
            // Emitted as inline html so remark-stringify writes the brackets
            // verbatim. As a text node it would be escaped to `\[!NOTE]`, which
            // stops it rendering as a callout anywhere else.
            state.openNode('paragraph')
            state.addNode('html', undefined, marker)
            state.addNode('text', undefined, '\n')
            state.next(first.content)
            state.closeNode()

            node.content.forEach((child, _offset, index) => {
              if (index > 0) state.next(child)
            })
          } else {
            state.openNode('paragraph')
            state.addNode('html', undefined, marker)
            state.closeNode()
            state.next(node.content)
          }

          state.closeNode()
        },
      },
    }
  })
}
