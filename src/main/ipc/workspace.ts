/**
 * Workspace, watching, search and the file operations the File menu needs.
 *
 * Everything that touches the disk lives here rather than in the renderer,
 * which is sandboxed.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { rename, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  allMarkdown,
  loadIgnores,
  readDirectory,
  type DirEntry,
  type MarkdownFile,
} from '../workspace'
import { watchRoot } from '../watcher'
import { cancelSearch, startSearch } from '../search'
import { clearJournal } from '../recovery'
import { getSettings, patchSettings } from '../settings'
import { log } from '../log'

export interface FileProperties {
  path: string
  name: string
  size: number
  createdMs: number
  modifiedMs: number
}

function windowOf(e: Electron.IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) throw new Error('no window for this request')
  return win
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:open-dialog', async (e): Promise<string | null> => {
    const r = await dialog.showOpenDialog(windowOf(e), {
      title: 'Open Folder',
      properties: ['openDirectory'],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const root = r.filePaths[0]
    // The sidebar is hidden until there is a folder to show, then shows it.
    patchSettings({ workspace: root, sidebar: { visible: true, panel: 'files' } })
    watchRoot(root)
    return root
  })

  ipcMain.handle('workspace:current', () => getSettings().workspace)

  ipcMain.handle('workspace:set', (_e, root: string | null) => {
    patchSettings({ workspace: root })
    watchRoot(root)
    return root
  })

  ipcMain.handle('workspace:read-dir', async (_e, dir: string): Promise<DirEntry[]> => {
    const root = getSettings().workspace
    const ignores = root ? await loadIgnores(root) : undefined
    return readDirectory(dir, ignores)
  })

  ipcMain.handle('workspace:all-markdown', async (_e, root?: string): Promise<MarkdownFile[]> => {
    const target = root ?? getSettings().workspace
    if (!target) return []
    return allMarkdown(target)
  })

  // --- search -------------------------------------------------------------

  ipcMain.handle('search:start', async (e, query: string, caseSensitive?: boolean) => {
    const root = getSettings().workspace
    if (!root) return -1
    return startSearch(windowOf(e), { root, query, caseSensitive })
  })

  ipcMain.handle('search:cancel', (e) => cancelSearch(windowOf(e)))

  // --- file operations ----------------------------------------------------

  ipcMain.handle('fileops:properties', async (_e, path: string): Promise<FileProperties> => {
    const s = await stat(path)
    return {
      path,
      name: basename(path),
      size: s.size,
      createdMs: s.birthtimeMs,
      modifiedMs: s.mtimeMs,
    }
  })

  ipcMain.handle('fileops:move', async (e, path: string): Promise<string | null> => {
    const r = await dialog.showSaveDialog(windowOf(e), {
      title: 'Move To',
      defaultPath: path,
      buttonLabel: 'Move',
    })
    if (r.canceled || !r.filePath || r.filePath === path) return null

    await rename(path, r.filePath)
    // The journal is keyed by path; leaving the old one behind would offer to
    // recover a file that no longer exists at that location.
    clearJournal(path)
    log.info('moved file', { from: path, to: r.filePath })
    return r.filePath
  })

  ipcMain.handle('fileops:delete', async (e, path: string): Promise<boolean> => {
    const r = await dialog.showMessageBox(windowOf(e), {
      type: 'warning',
      buttons: ['Move to Recycle Bin', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Delete ${basename(path)}?`,
      detail: 'The file will be moved to the Recycle Bin.',
    })
    if (r.response !== 0) return false

    // Recycle Bin, never an unlink: a mistaken delete must be recoverable
    // outside this application.
    await shell.trashItem(path)
    clearJournal(path)
    log.info('trashed file', { path })
    return true
  })

  ipcMain.handle('fileops:parent-dir', (_e, path: string) => dirname(path))
  ipcMain.handle('fileops:join', (_e, ...parts: string[]) => join(...parts))
}
