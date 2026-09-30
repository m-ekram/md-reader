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
import { resolveInside } from '../paths'
import { createFile, createFolder, renameEntry } from '../fileops'

export interface FileProperties {
  path: string
  name: string
  size: number
  createdMs: number
  modifiedMs: number
}

/** The folder the sidebar shows; an error when there is none. */
function openFolder(): string {
  const root = getSettings().workspace
  if (!root) throw new Error('No folder is open.')
  return root
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

  // Only inside the open folder: see paths.ts.
  ipcMain.handle('workspace:read-dir', async (_e, dir: string): Promise<DirEntry[]> => {
    const root = openFolder()
    return readDirectory(
      await resolveInside(root, dir, { allowRoot: true }),
      await loadIgnores(root)
    )
  })

  ipcMain.handle('workspace:all-markdown', async (_e, root?: string): Promise<MarkdownFile[]> => {
    const open = getSettings().workspace
    if (!open) return []
    return allMarkdown(await resolveInside(open, root ?? open, { allowRoot: true }))
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

  // From the sidebar, inside the open folder only: see fileops.ts.
  ipcMain.handle('fileops:create-file', async (_e, dir: string, name: string) => {
    const path = await createFile(openFolder(), dir, name)
    log.info('created file', { path })
    return path
  })
  ipcMain.handle('fileops:create-folder', async (_e, dir: string, name: string) => {
    const path = await createFolder(openFolder(), dir, name)
    log.info('created folder', { path })
    return path
  })

  ipcMain.handle('fileops:rename', async (_e, path: string, name: string) => {
    const to = await renameEntry(openFolder(), path, name)
    log.info('renamed', { from: path, to })
    return to
  })

  /**
   * To the Recycle Bin, never an unlink, after asking: a folder goes with
   * everything in it. Resolves to false when the user says no.
   */
  ipcMain.handle('fileops:trash', async (e, path: string): Promise<boolean> => {
    const target = await resolveInside(openFolder(), path)
    const isDir = (await stat(target)).isDirectory()
    const r = await dialog.showMessageBox(windowOf(e), {
      type: 'warning',
      buttons: ['Move to Recycle Bin', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Move “${basename(target)}” to the Recycle Bin?`,
      detail: isDir
        ? 'The folder and everything in it will be moved to the Recycle Bin.'
        : 'It can be put back from the Recycle Bin.',
    })
    if (r.response !== 0) return false
    await shell.trashItem(target)
    log.info('trashed', { path: target })
    return true
  })

  ipcMain.handle('fileops:parent-dir', (_e, path: string) => dirname(path))
  ipcMain.handle('fileops:join', (_e, ...parts: string[]) => join(...parts))
}
