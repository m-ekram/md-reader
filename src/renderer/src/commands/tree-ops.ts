/**
 * What the file tree does to files that may be open: separate from the
 * workspace store because closing a tab goes through `requestClose`.
 */
import { isDirty, useDocuments } from '../stores/documents'
import { refreshArticles, refreshTree } from '../stores/workspace'
import { showNotice } from '../stores/ui'
import { describeError } from '../utils/report'
import { flushAll } from '../editor/pool'
import { invalidateCommands } from './registry'
import { requestClose } from './app-commands'

/** Whether `path` is `root` or inside it, as Windows compares names. */
function under(path: string, root: string): boolean {
  const p = path.toLowerCase()
  const r = root.toLowerCase()
  return p === r || p.startsWith(`${r}\\`) || p.startsWith(`${r}/`)
}

/**
 * Moves a file or folder to the Recycle Bin, after asking. Open documents in
 * it that are saved close; any with unsaved work stay open, marked as gone
 * from disk, as they do when a file is deleted outside the app, so nothing
 * typed is lost.
 */
export async function trashFromTree(path: string): Promise<void> {
  flushAll()
  try {
    if (!(await window.api.fileops.trash(path))) return
  } catch (err) {
    showNotice(describeError(err), 'error')
    return
  }
  const docs = useDocuments()
  for (let i = docs.docs.length - 1; i >= 0; i--) {
    const d = docs.docs[i]
    if (!d.path || !under(d.path, path)) continue
    if (isDirty(d)) d.detached = true
    else await requestClose(i)
  }
  invalidateCommands()
  await refreshTree()
  void refreshArticles()
}
