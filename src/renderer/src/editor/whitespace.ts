/**
 * Show Whitespace: makes spaces, tabs and line breaks visible.
 *
 * Done with inline decorations carrying a class, and CSS that draws a marker
 * as a background. Nothing is inserted into the document and no text is
 * replaced, which matters more than it sounds: a decoration that substituted a
 * visible character would put that character in the selection, in the
 * clipboard, and eventually in the file.
 *
 * Decorations are rebuilt per transaction rather than mapped, because the
 * positions are derived from the text itself — mapping them through an edit
 * would drift out of step with the words around them.
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'

/**
 * Read at render time rather than injected: the plugin is created once per
 * editor, and the setting is toggled long afterwards.
 */
export const whitespaceState = { visible: false }

export function setShowWhitespace(visible: boolean): void {
  whitespaceState.visible = visible
}

/** Every run of spaces and tabs, plus each hard line break. */
function whitespaceDecorations(state: EditorState): DecorationSet {
  if (!whitespaceState.visible) return DecorationSet.empty

  const found: Decoration[] = []
  state.doc.descendants((node, pos) => {
    // Code keeps its own formatting and is displayed verbatim already; marking
    // the indentation of every fenced block would be noise rather than help.
    if (node.type.name === 'code_block') return false

    if (node.type.name === 'hardbreak') {
      found.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ws-break' }))
      return false
    }

    if (!node.isText || !node.text) return true

    const text = node.text
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch !== ' ' && ch !== '\t') continue
      // One decoration per character: a run of three spaces should show three
      // markers, not one stretched across the run.
      found.push(
        Decoration.inline(pos + i, pos + i + 1, { class: ch === '\t' ? 'ws-tab' : 'ws-space' })
      )
    }
    return true
  })

  return DecorationSet.create(state.doc, found)
}

const key = new PluginKey('ekram-whitespace')

export const whitespacePlugin: MilkdownPlugin[] = [
  $prose(
    () =>
      new Plugin({
        key,
        state: {
          init: (_config, state) => whitespaceDecorations(state),
          apply: (_tr, _value, _old, newState) => whitespaceDecorations(newState),
        },
        props: {
          decorations(state) {
            return key.getState(state) as DecorationSet | undefined
          },
        },
      })
  ),
] as MilkdownPlugin[]

/**
 * Removes trailing spaces and tabs from the end of every text block.
 *
 * Markdown's two-space hard break is not at risk here: in the editor a hard
 * break is its own node, so trailing spaces in the text are only ever the
 * accidental kind.
 *
 * Returns null when there was nothing to strip, so the caller can avoid
 * dispatching an empty transaction and putting a no-op on the undo stack.
 */
export function stripTrailingWhitespace(state: EditorState): Transaction | null {
  const tr = state.tr
  let changed = 0

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') return false
    if (!node.isTextblock) return true

    // The last child, not the block's textContent: an inline image or a math
    // node contributes nothing to textContent but does occupy positions, so
    // offsets derived from the text would land in the wrong place.
    const last = node.lastChild
    if (!last?.isText || !last.text) return true

    const trimmed = last.text.replace(/[ \t]+$/, '')
    if (trimmed.length === last.text.length) return true

    const childStart = pos + 1 + (node.content.size - last.nodeSize)
    // Mapped through the deletions earlier blocks already made in this same
    // transaction, or every block after the first would be off.
    const from = tr.mapping.map(childStart + trimmed.length)
    const to = tr.mapping.map(childStart + last.text.length)
    tr.delete(from, to)
    changed++
    return true
  })

  return changed > 0 ? tr : null
}
