/**
 * `[[Wiki links]]` on screen: marked, and followed with Ctrl+click.
 *
 * Markdown has no wiki links, so they are text to the editor (see
 * wiki-links.ts for how they are kept on save). They are found in the text and
 * given an inline decoration, which styles them and carries the target; the
 * text itself is never changed.
 *
 * On the typing path, so after an edit only the text blocks the edit touched
 * are scanned again; the rest of the marks are carried through the edit.
 * A change that moves only the caret costs nothing.
 */
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'

/** One `[[…]]` span, as the serializer keeps it: no brackets or line break inside. */
const WIKI_LINK = /\[\[[^[\]\n]+?\]\]/g

export const wikiLinkKey = new PluginKey<DecorationSet>('wiki-links')

/** A link's parts: `[[name#heading|label]]`. */
export function parseWikiTarget(link: string): { name: string; heading: string; label: string } {
  const inner = link.replace(/^\[\[|\]\]$/g, '')
  const [target, label = ''] = inner.split('|', 2)
  const [name, heading = ''] = target.split('#', 2)
  return { name: name.trim(), heading: heading.trim(), label: label.trim() }
}

/** The links in one text block, which starts at `pos`. */
function scanBlock(block: ProseNode, pos: number, into: Decoration[]): void {
  if (!block.isTextblock || block.type.spec.code) return
  // The block's text with one stand-in character for each inline node that is
  // not text (an image, a line break), which takes one position too, so an
  // offset in the text is an offset in the document.
  let text = ''
  block.forEach((child) => {
    text += child.isText ? child.text! : '￼'.repeat(child.nodeSize)
  })
  for (const m of text.matchAll(WIKI_LINK)) {
    const from = pos + 1 + (m.index ?? 0)
    into.push(
      Decoration.inline(
        from,
        from + m[0].length,
        { class: 'wiki-link', 'data-wiki': m[0], title: 'Ctrl+click to open' },
        { wiki: m[0] }
      )
    )
  }
}

function scanAll(doc: ProseNode): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      scanBlock(node, pos, found)
      return false
    }
    return true
  })
  return DecorationSet.create(doc, found)
}

/** Carries the marks through an edit, and scans again only the blocks it touched. */
function update(tr: Transaction, set: DecorationSet): DecorationSet {
  let next = set.map(tr.mapping, tr.doc)
  const doc = tr.doc
  const touched = new Map<number, ProseNode>()
  tr.mapping.maps.forEach((map, i) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      // Into the final document, through the steps after this one.
      const rest = tr.mapping.slice(i + 1)
      const from = Math.max(0, Math.min(rest.map(newStart, -1), doc.content.size))
      const to = Math.max(from, Math.min(rest.map(newEnd, 1), doc.content.size))
      doc.nodesBetween(from, to, (node, pos) => {
        if (node.isTextblock) {
          touched.set(pos, node)
          return false
        }
        return true
      })
    })
  })
  for (const [pos, block] of touched) {
    next = next.remove(next.find(pos, pos + block.nodeSize))
    const found: Decoration[] = []
    scanBlock(block, pos, found)
    next = next.add(doc, found)
  }
  return next
}

/**
 * The plugin. `onFollow` is called with a link's text on Ctrl+click; the
 * click is otherwise left to the editor, so a plain click places the caret.
 */
export function wikiLinkPlugin(onFollow?: (link: string) => void): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: wikiLinkKey,
    state: {
      init: (_config, state) => scanAll(state.doc),
      apply: (tr, set) => (tr.docChanged ? update(tr, set) : set),
    },
    props: {
      decorations: (state) => wikiLinkKey.getState(state),
      handleClick: (view, pos, event) => {
        if (!onFollow || !(event.ctrlKey || event.metaKey)) return false
        const set = wikiLinkKey.getState(view.state)
        const hit = set?.find(pos, pos).find((d) => d.from <= pos && pos <= d.to)
        if (!hit) return false
        onFollow((hit.spec as { wiki: string }).wiki)
        return true
      },
    },
  })
}
