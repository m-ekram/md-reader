/**
 * The Selection and Delete Range submenus, table row movement, and the
 * remaining Paragraph and Format items.
 *
 * Selection by word and line is done here rather than by a library command:
 * ProseMirror thinks in document positions, not words, so the boundaries come
 * from the text of the block the caret is in.
 */
import { TextSelection, NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { moveRowCommand } from '@milkdown/kit/preset/gfm'
import { canEdit, fromView, hasEditor, runCommand, withView } from '../editor/view'
import { isInTable, selectedRect } from '@milkdown/kit/prose/tables'
import { registerAll, type Command } from './registry'

/** Word characters for selection purposes: letters, digits, and the joiners. */
const WORD = /[\p{L}\p{N}_'-]/u

/**
 * Expands to the word under the caret.
 *
 * Offsets are computed inside the parent text block, so the search cannot run
 * past a block boundary into an unrelated paragraph.
 */
function selectWord(view: EditorView): void {
  const { state } = view
  const { $from } = state.selection
  const parent = $from.parent
  if (!parent.isTextblock) return

  const text = parent.textContent
  const start = $from.start()
  const offset = $from.pos - start

  let from = offset
  let to = offset
  while (from > 0 && WORD.test(text[from - 1] ?? '')) from--
  while (to < text.length && WORD.test(text[to] ?? '')) to++
  if (from === to) return

  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start + from, start + to)))
}

/** The whole text block the caret is in. */
function selectLine(view: EditorView): void {
  const { state } = view
  const { $from } = state.selection
  if (!$from.parent.isTextblock) return
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, $from.start(), $from.end())))
}

/** The enclosing top-level block, as a node selection. */
function selectBlock(view: EditorView): void {
  const { state } = view
  const { $from } = state.selection
  const depth = Math.min($from.depth, 1)
  if (depth < 1) return
  view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.before(depth))))
}

/** Selects with `select`, then removes what was selected. */
function deleteWith(select: (view: EditorView) => void) {
  return () =>
    withView((view) => {
      select(view)
      const { state } = view
      if (state.selection.empty) return
      view.dispatch(state.tr.deleteSelection())
    })
}

/** Inserts an empty paragraph before or after the current block. */
function insertParagraph(where: 'before' | 'after') {
  return () =>
    withView((view) => {
      const { state } = view
      const { $from } = state.selection
      const depth = Math.min($from.depth, 1)
      if (depth < 1) return

      const pos = where === 'before' ? $from.before(depth) : $from.after(depth)
      const paragraph = state.schema.nodes.paragraph.create()
      const tr = state.tr.insert(pos, paragraph)
      // Put the caret in the paragraph that was just created, which is what
      // makes the command useful rather than merely correct.
      tr.setSelection(TextSelection.create(tr.doc, pos + 1))
      view.dispatch(tr)
    })
}

/** Inserts a block-level node that takes no content, such as [TOC]. */
function insertAtomBlock(nodeName: string) {
  return () =>
    withView((view) => {
      const { state } = view
      const type = state.schema.nodes[nodeName]
      if (!type) return
      view.dispatch(state.tr.replaceSelectionWith(type.create()))
    })
}

/**
 * Where the row with the caret would move, or null when it cannot: outside a
 * table, the header row, or the first or last body row going past its end.
 *
 * The move takes row numbers. It was handed a document position instead, and
 * moved nothing, or the header.
 */
function rowMove(delta: -1 | 1): { from: number; to: number; pos: number } | null {
  if (!canEdit()) return null
  return fromView((view) => {
    if (!isInTable(view.state)) return null
    const rect = selectedRect(view.state)
    const from = rect.top
    const to = from + delta
    // Row 0 is the header: it stays, and no body row takes its place.
    if (from < 1 || to < 1 || to >= rect.map.height) return null
    return { from, to, pos: view.state.selection.from }
  }, null)
}

function moveRow(delta: -1 | 1): void {
  const move = rowMove(delta)
  if (move) runCommand(moveRowCommand.key, move)
}

const selectionCommands: Command[] = [
  { id: 'edit.selectWord', enabled: hasEditor, run: () => withView(selectWord) },
  { id: 'edit.selectLine', enabled: hasEditor, run: () => withView(selectLine) },
  { id: 'edit.selectBlock', enabled: hasEditor, run: () => withView(selectBlock) },

  { id: 'edit.deleteWord', enabled: canEdit, run: deleteWith(selectWord) },
  { id: 'edit.deleteLine', enabled: canEdit, run: deleteWith(selectLine) },
  { id: 'edit.deleteBlock', enabled: canEdit, run: deleteWith(selectBlock) },

  // Table rows. The accelerators are Alt+Up/Down, which nothing else claims.
  {
    id: 'edit.moveRowUp',
    enabled: () => rowMove(-1) !== null,
    run: () => moveRow(-1),
  },
  {
    id: 'edit.moveRowDown',
    enabled: () => rowMove(1) !== null,
    run: () => moveRow(1),
  },

  { id: 'para.insertBefore', enabled: canEdit, run: insertParagraph('before') },
  { id: 'para.insertAfter', enabled: canEdit, run: insertParagraph('after') },

  // Both exist as real nodes in the schema, so inserting them is direct.
  { id: 'para.toc', enabled: canEdit, run: insertAtomBlock('toc') },

  /**
   * Inline math.
   *
   * The schema has `math_inline` but no block equivalent, so Math Block stays
   * unimplemented rather than pretending: block math is plain text in the
   * document and inserting it here would not produce a rendered node.
   */
  {
    id: 'edit.mathInline',
    enabled: canEdit,
    run: () =>
      withView((view) => {
        const { state } = view
        const type = state.schema.nodes.math_inline
        if (!type) return
        const { from, to, empty } = state.selection
        const body = empty ? '' : state.doc.textBetween(from, to, ' ')
        view.dispatch(state.tr.replaceSelectionWith(type.create({ value: body })))
      }),
  },

  /**
   * Clear formatting.
   *
   * Removes every mark from the selection. Block type is left alone: someone
   * clearing formatting on a heading means the bold inside it, not the heading.
   */
  {
    id: 'format.clear',
    enabled: canEdit,
    run: () =>
      withView((view) => {
        const { state } = view
        const { from, to, empty } = state.selection
        if (empty) return
        const tr = state.tr
        for (const mark of Object.values(state.schema.marks)) tr.removeMark(from, to, mark)
        view.dispatch(tr)
      }),
  },
]

export function registerSelectionCommands(): void {
  registerAll(selectionCommands)
}
