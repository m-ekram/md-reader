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
import type { DocumentFile } from '../../../shared/ipc'
import { isDirty, journalKey, markSaved, useDocuments, type Doc } from './documents'
import { refreshArticles, refreshTree, useWorkspace } from './workspace'
import { invalidateCommands } from '../commands/registry'
import { flushAll } from '../editor/pool'

const docs = useDocuments()

function docFor(path: string): Doc | undefined {
  const lower = path.toLowerCase()
  return docs.docs.find((d) => d.path?.toLowerCase() === lower)
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Replaces a document with the file as it is on disk: the one way a reload
 * happens, whether a watcher saw the change or the user chose Reload.
 *
 * Everything that describes the file comes with it. Two earlier copies of this
 * each missed something: Reload from Disk never bumped `reloadToken`, so the
 * screen kept the old text and the next save wrote it back; and a reload over
 * unsaved edits kept the old encoding and line endings.
 */
export function adoptFromDisk(doc: Doc, file: DocumentFile): void {
  doc.content = file.content
  markSaved(doc, file.content, file.eol)
  doc.mtimeMs = file.mtimeMs
  doc.encoding = file.encoding
  doc.hasBom = file.hasBom
  doc.eol = file.eol
  doc.lossy = null
  doc.reloadToken++
  doc.detached = false
  invalidateCommands()
}

async function handleChanged(path: string): Promise<void> {
  const doc = docFor(path)
  if (!doc) return
  // Compared against the buffer below, which lags the editor by a debounce: an
  // edit typed just before the change would read as "no unsaved changes" and
  // be silently replaced by the reload.
  flushAll()

  let file
  try {
    file = await window.api.file.read(path)
  } catch {
    return // vanished again between the event and the read
  }

  // Our own save produced this event: nothing to do.
  if (file.content === doc.content) {
    markSaved(doc, file.content, file.eol)
    doc.mtimeMs = file.mtimeMs
    doc.detached = false
    invalidateCommands()
    return
  }

  // The file was touched but not changed: its attributes or timestamp moved
  // while its content is still exactly what we last loaded or saved. On
  // Windows this is routine — a sync client, an antivirus scan, a backup tool
  // setting the archive bit, a git checkout. Treating it as a change put a
  // "reload and lose your edits?" prompt in front of a user whose file had not
  // changed at all.
  if (file.content === doc.savedContent) {
    doc.mtimeMs = file.mtimeMs
    return
  }

  if (!isDirty(doc)) {
    // Nothing to lose, so take the newer version without interrupting.
    adoptFromDisk(doc, file)
    return
  }

  // Its own dialog: this used the recovery prompt, whose buttons read Restore
  // and Discard, with Restore — reload, losing the edits — as the default.
  const takeTheirs = await window.api.file.confirmReload(doc.name)
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
  if (added.length === 0) return handled

  const removedNow = removed
    .map((path) => ({ path, doc: docFor(path) }))
    .filter((c): c is { path: string; doc: Doc } => c.doc !== undefined)
  // Removed in an earlier batch. The watcher reports a new file only once its
  // size has held still, which can be after it has sent the removal on its
  // own: matched within one batch only, a rename on a busy machine detached
  // the tab instead. Recently, so a file deleted long ago is not taken to be
  // an unrelated copy made later.
  const removedJustBefore = docs.docs
    .filter((d) => d.detached && d.path !== null && !removedNow.some((c) => c.doc === d))
    .filter((d) => performance.now() - (detachedAt.get(d) ?? -Infinity) < RENAME_WINDOW_MS)
    .map((d) => ({ path: d.path!, doc: d }))
  const candidates = [...removedNow, ...removedJustBefore]
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

/** How long after its file went a document may still turn out to be renamed. */
const RENAME_WINDOW_MS = 5000

/** When each document's file went, on a clock that only moves forward. */
const detachedAt = new WeakMap<Doc, number>()

function markDetached(path: string): void {
  const doc = docFor(path)
  if (!doc) return
  // The tab stays, with its content. Closing it here would destroy work every
  // time a sync client briefly removed a file.
  doc.detached = true
  detachedAt.set(doc, performance.now())
  invalidateCommands()
}

export function initExternalChanges(): void {
  window.api.workspace.onWatchEvents((events: WatchEvent[]) => {
    void processEvents(events)
  })
}

async function processEvents(all: WatchEvent[]): Promise<void> {
  const ws = useWorkspace()
  // Folders only change the tree; documents are files.
  const folders = all.filter((e) => e.dir)
  const events = all.filter((e) => !e.dir)
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

  // The flat list is what Articles and Open Quickly read from, and the tree
  // what Files shows: both follow files and folders appearing and going.
  if ((removed.length > 0 || added.length > 0 || folders.length > 0) && ws.root) {
    void refreshArticles()
    void refreshTree()
  }
}
