/**
 * YAML front matter.
 *
 * Phase 0 promoted this from a later phase into Phase 1, because without it the
 * behaviour is not merely lossy but destructive. A file opening with:
 *
 *     ---
 *     title: Test
 *     tags: [a, b]
 *     ---
 *
 * comes back out as a thematic break, a paragraph, and a setext heading — the
 * metadata is gone and the document is restructured into something the user
 * never wrote. Front matter is ubiquitous in real notes, so no save path can
 * ship before this exists.
 *
 * The node is deliberately a plain code-like block: the goal here is faithful
 * preservation, not a metadata editing UI.
 */
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import remarkFrontmatter from 'remark-frontmatter'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'

/** Teaches remark to recognize `---` fenced YAML at the top of a document. */
export const remarkFrontmatterPlugin = $remark('frontmatter', () => remarkFrontmatter as never, [
  'yaml',
] as never)

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  defining: true,
  code: true,
  // Only meaningful as the first node; keeping it non-draggable avoids a user
  // accidentally relocating it into the middle of the document.
  selectable: false,
  parseDOM: [
    {
      tag: 'div[data-type="frontmatter"]',
      preserveWhitespace: 'full' as const,
    },
  ],
  toDOM: () => ['div', { 'data-type': 'frontmatter', class: 'frontmatter' }, 0] as const,
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state
        .openNode(type)
        .addText(typeof node.value === 'string' ? node.value : '')
        .closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.textContent)
    },
  },
}))

export const frontmatterPlugin: MilkdownPlugin[] = [
  remarkFrontmatterPlugin,
  frontmatterSchema,
].flat() as MilkdownPlugin[]
