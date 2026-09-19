/**
 * File operations. Every write goes through here so the data-integrity rules
 * are enforced in one place rather than sprinkled across the renderer.
 */
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { stat } from 'node:fs/promises'
import { readTextFile, writeTextFile } from '../fs/textfile'
import { backup, clearJournal, journal, pendingRecoveries } from '../recovery'
import { addRecentFile } from '../settings'
import { log } from '../log'
import type { DocumentFile, SaveRequest, SaveResult } from '../../shared/ipc'

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
  { name: 'All Files', extensions: ['*'] },
]

async function openPath(path: string): Promise<DocumentFile> {
  const f = await readTextFile(path)
  const s = await stat(path)
  addRecentFile(path)
  return { path, ...f, mtimeMs: s.mtimeMs }
}

export function registerFileIpc(): void {
  ipcMain.handle('file:open-dialog', async (e): Promise<DocumentFile[] | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(win!, {
      title: 'Open',
      filters: MD_FILTERS,
      properties: ['openFile', 'multiSelections'],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return Promise.all(r.filePaths.map(openPath))
  })

  ipcMain.handle('file:read', async (_e, path: string) => openPath(path))

  ipcMain.handle('file:save', async (_e, req: SaveRequest): Promise<SaveResult> => {
    try {
      // Refuse to clobber a file that changed under us; the renderer turns this
      // into a prompt rather than silently overwriting someone else's edit.
      let previous: string | null = null
      try {
        const s = await stat(req.path)
        if (req.expectedMtimeMs !== undefined && s.mtimeMs > req.expectedMtimeMs + 1) {
          return { ok: false, reason: 'conflict', message: 'The file changed on disk since it was opened.' }
        }
        previous = (await readTextFile(req.path)).content
      } catch {
        // New file: nothing to back up.
      }

      if (previous !== null) backup(req.path, previous)
      await writeTextFile(req.path, req.content, req)
      clearJournal(req.path)

      const s = await stat(req.path)
      addRecentFile(req.path)
      return { ok: true, mtimeMs: s.mtimeMs }
    } catch (err) {
      log.error('save failed', { path: req.path, err: String(err) })
      return { ok: false, reason: 'error', message: String(err) }
    }
  })

  ipcMain.handle('file:save-as-dialog', async (e, suggested?: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showSaveDialog(win!, {
      title: 'Save As',
      defaultPath: suggested,
      filters: MD_FILTERS,
    })
    return r.canceled || !r.filePath ? null : r.filePath
  })

  // Journalling is fire-and-forget: it must never block or fail a keystroke.
  ipcMain.on('file:journal', (_e, path: string, content: string) => journal(path, content))
  ipcMain.handle('file:pending-recoveries', () => pendingRecoveries())
  ipcMain.handle('file:discard-recovery', (_e, path: string) => clearJournal(path))

  ipcMain.handle('file:show-in-folder', (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle(
    'file:confirm-close',
    async (e, names: string[]): Promise<'save' | 'discard' | 'cancel'> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const list = names.length === 1 ? `"${names[0]}"` : `${names.length} documents`
      const r = await dialog.showMessageBox(win!, {
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: `Save changes to ${list}?`,
        detail: 'Your changes will be lost if you don’t save them.',
      })
      return (['save', 'discard', 'cancel'] as const)[r.response]
    }
  )
}
