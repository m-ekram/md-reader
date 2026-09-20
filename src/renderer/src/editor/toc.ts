/**
 * The `[TOC]` marker.
 *
 * Written on its own line it means "insert a table of contents here". Without a
 * node for it the brackets are escaped on save and the file comes back as
 * `\[TOC]`, which stops every other renderer honouring it. Phase 0 measured
 * that as a real loss.
 *
 * A remark plugin turns the marker paragraph into its own mdast node, which a
 * schema then maps to an atom. Doing it that way avoids intercepting paragraph
 * parsing, which would collide with commonmark's own handling.
 *
 * Scope note: the marker is preserved and shown as a labelled block. Rendering
 * a live, clickable contents list inside the document is deliberately left out
 * of this phase — the Outline panel already provides that navigation, and the
 * thing that actually mattered here was not destroying the marker.
 */
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { visit } from 'unist-util-visit'

const TOC_MARKER = /^\[TOC\]$/i

interface MdastNode {
  type: string
  children?: MdastNode[]
  value?: string
}

export function isTocMarker(line: string): boolean {
  return TOC_MARKER.test(line.trim())
}

/** Rewrites a lone `[TOC]` paragraph into a node of its own. */
export const remarkToc = $remark('toc', () => () => (tree: MdastNode) => {
  visit(tree as never, 'paragraph', (node: MdastNode) => {
    const children = node.children ?? []
    if (children.length !== 1) return
    const only = children[0]
    if (only.type !== 'text' || typeof only.value !== 'string') return
    if (!isTocMarker(only.value)) return

    // Mutating in place is what `visit` expects; replacing the node wholesale
    // would require tracking the parent and index.
    node.type = 'toc'
    delete node.children
  })
})

export const tocSchema = $nodeSchema('toc', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  parseDOM: [{ tag: 'div[data-type="toc"]' }],
  toDOM: () => [
    'div',
    { 'data-type': 'toc', class: 'toc-marker', contenteditable: 'false' },
    'Table of Contents',
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'toc',
    runner: (state, _node, type) => {
      state.addNode(type)
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'toc',
    runner: (state) => {
      // Emitted as html so the brackets are written verbatim; as text they
      // would be escaped to `\[TOC]`.
      state.addNode('html', undefined, '[TOC]')
    },
  },
}))

export const tocPlugin: MilkdownPlugin[] = [remarkToc, tocSchema].flat() as MilkdownPlugin[]
