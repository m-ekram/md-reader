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
import { isDirty, journalKey, useDocuments, type Doc } from './documents'
import { refreshArticles, useWorkspace } from './workspace'
import { invalidateCommands } from '../commands/registry'

const docs = useDocuments()

function docFor(path: string): Doc | undefined {
  const lower = path.toLowerCase()
  return docs.docs.find((d) => d.path?.toLowerCase() === lower)
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Applies file content to a document that has nothing unsaved to lose. */
function adoptFromDisk(doc: Doc, file: { content: string; mtimeMs: number }): void {
  doc.content = file.content
  doc.savedContent = file.content
  doc.mtimeMs = file.mtimeMs
  doc.lossy = null
  doc.reloadToken++
  doc.detached = false
  invalidateCommands()
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
    doc.encoding = file.encoding
    doc.hasBom = file.hasBom
    doc.eol = file.eol
    adoptFromDisk(doc, file)
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
  adoptFromDisk(doc, file)
}

/**
 * Moves an open document to a new path after a rename.
 *
 * The journal is keyed by path, so it has to move too — otherwise the next
 * launch offers to recover a file that no longer exists at that location.
 */
function followRename(doc: Doc, newPath: string, mtimeMs: number): void {
  const oldKey = journalKey(doc)
  doc.path = newPath
  doc.name = nameOf(newPath)
  doc.mtimeMs = mtimeMs
  doc.detached = false

  void window.api.file.discardRecovery(oldKey)
  if (isDirty(doc)) window.api.file.journal(journalKey(doc), doc.content)
  invalidateCommands()
}

/**
 * Correlates removals with additions to recognise a rename.
 *
 * A rename reaches the watcher as a remove of the old path and an add of the
 * new one, with no indication that they are related. They are matched by
 * content: if a file appears holding exactly what a just-removed open document
 * held, it is the same file under a new name. Content rather than timing,
 * because two unrelated files moving in the same instant would otherwise be
 * mistaken for each other.
 */
async function resolveRenames(removed: string[], added: string[]): Promise<Set<string>> {
  const handled = new Set<string>()
  if (removed.length === 0 || added.length === 0) return handled

  const candidates = removed
    .map((path) => ({ path, doc: docFor(path) }))
    .filter((c): c is { path: string; doc: Doc } => c.doc !== undefined)
  if (candidates.length === 0) return handled

  for (const addedPath of added) {
    if (docFor(addedPath)) continue // already open in its own right

    let file
    try {
      file = await window.api.file.read(addedPath)
    } catch {
      continue
    }

    const match = candidates.find(
      (c) => !handled.has(c.path) && c.doc.savedContent === file.content
    )
    if (!match) continue

    followRename(match.doc, addedPath, file.mtimeMs)
    handled.add(match.path)
  }

  return handled
}

function markDetached(path: string): void {
  const doc = docFor(path)
  if (!doc) return
  // The tab stays, with its content. Closing it here would destroy work every
  // time a sync client briefly removed a file.
  doc.detached = true
  invalidateCommands()
}

export function initExternalChanges(): void {
  window.api.workspace.onWatchEvents((events: WatchEvent[]) => {
    void processEvents(events)
  })
}

async function processEvents(events: WatchEvent[]): Promise<void> {
  const ws = useWorkspace()
  const removed = events.filter((e) => e.kind === 'removed').map((e) => e.path)
  const added = events.filter((e) => e.kind === 'added').map((e) => e.path)

  // Renames first: a removal that turns out to be a rename must not detach the
  // tab on its way through.
  const renamed = await resolveRenames(removed, added)

  for (const path of removed) {
    if (!renamed.has(path)) markDetached(path)
  }

  for (const e of events) {
    if (e.kind === 'changed') void handleChanged(e.path)
    else if (e.kind === 'added') {
      // A file reappearing at a path we already have open: it came back.
      const doc = docFor(e.path)
      if (doc?.detached) {
        doc.detached = false
        void handleChanged(e.path)
      }
    }
  }

  // The flat list is what Articles and Open Quickly read from, so it has to
  // follow files appearing and disappearing.
  if ((removed.length > 0 || added.length > 0) && ws.root) void refreshArticles()
}
