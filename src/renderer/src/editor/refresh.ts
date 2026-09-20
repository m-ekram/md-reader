/**
 * Forcing the active editor to rebuild its decorations.
 *
 * ProseMirror only recomputes decorations when a transaction arrives, so a
 * toggle that changes no document content — focus mode, typewriter, whitespace
 * markers — has no visible effect until the next keystroke. An empty
 * transaction is the cheapest way to say "nothing changed, but look again".
 *
 * Shared rather than written per feature: it was already duplicated in two
 * command files, and the third copy was the one that forgot to call it.
 */
import { editorViewCtx } from '@milkdown/kit/core'
import { activeEditor } from './pool'

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
