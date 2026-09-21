/**
 * Access to the editor on screen, in one place.
 *
 * Every command that reads or changes the document needs the same few moves:
 * find the active editor, reach its ProseMirror view, survive the moment during
 * a document switch when the view is being torn down, and put focus back
 * afterwards. Those moves were written out separately in four command files,
 * and the copies drifted: one of them was the only place that forgot to
 * refresh decorations after a toggle, which is how whitespace markers came to
 * need a keystroke before they appeared.
 */
import { editorViewCtx } from '@milkdown/kit/core'
import type { CmdKey } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { activeDoc } from '../stores/documents'
import { activeEditor } from './pool'

/** True when a document is open in the formatted view, which commands need. */
export const hasEditor = (): boolean => activeDoc.value !== null && activeEditor() !== null

/**
 * Runs `fn` against the view on screen, then returns focus to it.
 *
 * Focus matters because commands run from the menu, and a menu click leaves
 * focus in the menu: without this the next keystroke goes nowhere.
 */
export function withView(fn: (view: EditorView) => void): void {
  const handle = activeEditor()
  if (!handle) return
  handle.crepe.editor.action((ctx) => {
    try {
      const view = ctx.get(editorViewCtx)
      fn(view)
      view.focus()
    } catch {
      // The view can be mid-teardown during a document switch.
    }
  })
}

/** Reads something from the view on screen, without changing it or its focus. */
export function fromView<T>(fn: (view: EditorView) => T, fallback: T): T {
  const handle = activeEditor()
  if (!handle) return fallback
  let out = fallback
  handle.crepe.editor.action((ctx) => {
    try {
      out = fn(ctx.get(editorViewCtx))
    } catch {
      out = fallback
    }
  })
  return out
}

/** Matches a node type by exact name, or by a test for families such as tables. */
export type NodeMatch = string | ((name: string) => boolean)

/** The nearest ancestor of the caret matching `match`, with its position. */
export function ancestor(
  view: EditorView,
  match: NodeMatch
): { node: ProseNode; pos: number; depth: number } | null {
  const test = typeof match === 'string' ? (name: string) => name === match : match
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (test(node.type.name)) return { node, pos: $from.before(d), depth: d }
  }
  return null
}

/** True when the caret is inside a node matching `match`, at any depth. */
export function caretIn(match: NodeMatch): boolean {
  return fromView((view) => ancestor(view, match) !== null, false)
}

/** Runs a Milkdown command against the editor on screen, then refocuses it. */
export function runCommand<T>(key: CmdKey<T>, payload?: T): void {
  const handle = activeEditor()
  if (!handle) return
  handle.crepe.editor.action(callCommand(key, payload))
  withView(() => {})
}

/**
 * Makes the view rebuild its decorations.
 *
 * ProseMirror recomputes decorations only when a transaction arrives, so a
 * toggle that changes no document content — focus mode, whitespace markers —
 * has no visible effect until the next keystroke. An empty transaction is the
 * cheapest way to say "nothing changed, but look again".
 *
 * Focus is left where it is: this runs from the preferences dialog too, and
 * pulling focus into the document would close the dialog's keyboard path.
 */
export function refreshDecorations(): void {
  const handle = activeEditor()
  if (!handle) return
  handle.crepe.editor.action((ctx) => {
    try {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr)
    } catch {
      // The view can be mid-teardown during a document switch.
    }
  })
}
