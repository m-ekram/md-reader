/**
 * How the app reacts when files change underneath it.
 *
 * The governing rule is that the user's unsaved work outranks whatever happened
 * on disk. A clean document can be refreshed silently because there is nothing
 * to lose; a dirty one must ask. A deleted file never closes its tab, because
 * sync tools remove and recreate files routinely and closing the tab would
 * discard the buffer.
 */
import type { WatchEvent } from '../../../main/watcher'
import { isDirty, useDocuments } from './documents'
import { refreshArticles, useWorkspace } from './workspace'
import { invalidateCommands } from '../commands/registry'

const docs = useDocuments()

function docFor(path: string) {
  const lower = path.toLowerCase()
  return docs.docs.find((d) => d.path?.toLowerCase() === lower)
}

async function handleChanged(path: string): Promise<void> {
  const doc = docFor(path)
  if (!doc) return

  let file
  try {
    file = await window.api.file.read(path)
  } catch {
    return // vanished again between the event and the read
  }

  // Our own save produced this event: nothing to do.
  if (file.content === doc.content) {
    doc.savedContent = file.content
    doc.mtimeMs = file.mtimeMs
    doc.detached = false
    invalidateCommands()
    return
  }

  if (!isDirty(doc)) {
    // Nothing to lose, so take the newer version without interrupting.
    doc.content = file.content
    doc.savedContent = file.content
    doc.mtimeMs = file.mtimeMs
    doc.encoding = file.encoding
    doc.hasBom = file.hasBom
    doc.eol = file.eol
    doc.lossy = null
    doc.reloadToken++
    doc.detached = false
    invalidateCommands()
    return
  }

  const takeTheirs = await window.api.app.confirm(
    `${doc.name} changed on disk`,
    'This document has unsaved changes.\n\nReload from disk and lose them, or keep your version?'
  )
  if (!takeTheirs) {
    // Keeping ours: adopt the new mtime so the next save is not blocked by a
    // conflict the user has already decided about.
    doc.mtimeMs = file.mtimeMs
    return
  }

  doc.content = file.content
  doc.savedContent = file.content
  doc.mtimeMs = file.mtimeMs
  doc.lossy = null
  doc.reloadToken++
  doc.detached = false
  invalidateCommands()
}

function handleRemoved(path: string): void {
  const doc = docFor(path)
  if (!doc) return
  // The tab stays, with its content. Closing it here would destroy work every
  // time a sync client briefly removed a file.
  doc.detached = true
  invalidateCommands()
}

export function initExternalChanges(): void {
  window.api.workspace.onWatchEvents((events: WatchEvent[]) => {
    const ws = useWorkspace()
    let touchedTree = false

    for (const e of events) {
      if (e.kind === 'changed') void handleChanged(e.path)
      else if (e.kind === 'removed') {
        handleRemoved(e.path)
        touchedTree = true
      } else if (e.kind === 'added') {
        touchedTree = true
        // An add for an open, detached document means it came back.
        const doc = docFor(e.path)
        if (doc?.detached) {
          doc.detached = false
          void handleChanged(e.path)
        }
      }
    }

    // The flat list is what Articles and Open Quickly read from, so it has to
    // follow files appearing and disappearing.
    if (touchedTree && ws.root) void refreshArticles()
  })
}
