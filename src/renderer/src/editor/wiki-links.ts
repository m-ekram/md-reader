/**
 * `[[Wiki links]]`, kept exactly as written.
 *
 * Markdown has no wiki links, so the parser reads `[[Note]]` as plain text, and
 * the serializer escapes plain text's brackets: every file with a wiki link was
 * rewritten on save as `\[\[Note]]`, with `my\_note` and `a\*b` inside them,
 * which broke the links for every other tool that reads the folder. The round
 * trip guard then warned about the file, and auto-save left it alone.
 *
 * The text handler is wrapped: a `[[…]]` span is written as it was read, and
 * the text either side goes through the usual escaping. In a table cell, a `|`
 * inside the link is written `\|`, as it was read, or it would split the cell.
 */
import type { Options } from 'remark-stringify'

type Handlers = NonNullable<Options['handlers']>
type TextHandler = NonNullable<Handlers['text']>

/** One `[[…]]` span: no brackets or line break inside it. */
const WIKI_LINK = /\[\[[^[\]\n]+?\]\]/g

/** The plain handler, for when no other is configured. */
const safeText: TextHandler = (node, _parent, state, info) => state.safe(node.value, info)

export function keepWikiLinks(text: TextHandler = safeText): TextHandler {
  return (node, parent, state, info) => {
    const value = node.value
    if (!value.includes('[[')) return text(node, parent, state, info)

    const inCell = state.stack.includes('tableCell')
    let out = ''
    let last = 0
    for (const match of value.matchAll(WIKI_LINK)) {
      const start = match.index ?? 0
      const before = value.slice(last, start)
      if (before) {
        out += text({ ...node, value: before }, parent, state, {
          ...info,
          before: out ? out.slice(-1) : info.before,
          after: '[',
        })
      }
      out += inCell ? match[0].replace(/\|/g, '\\|') : match[0]
      last = start + match[0].length
    }
    const rest = value.slice(last)
    if (rest) out += text({ ...node, value: rest }, parent, state, { ...info, before: ']' })
    return out
  }
}
