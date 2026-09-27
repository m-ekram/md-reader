/**
 * File operations. Every write goes through here so the data-integrity rules
 * are enforced in one place rather than sprinkled across the renderer.
 */
import { ipcMain, dialog, shell, BrowserWindow, app, webContents } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { readTextFile, writeTextFile } from '../fs/textfile'
import { backup, backupInfo, clearJournal, journal, pendingRecoveries } from '../recovery'
import { addRecentFile } from '../settings'
import { log } from '../log'
import { forgetOwner, forgetPage, noteOwner, recoverableFor } from '../journal-owners'
import type { DocumentFile, SaveRequest, SaveResult } from '../../shared/ipc'
import { explainSaveError } from '../../shared/save-errors'

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
      let previous: Buffer | null = null
      try {
        const s = await stat(req.path)
        // Any other time, not only a newer one: a sync client or a backup
        // restore puts a file back with its original, older time, and asking
        // only "is it newer?" let a save overwrite that without a word. The
        // millisecond of slack absorbs file systems that round times.
        if (req.expectedMtimeMs !== undefined && Math.abs(s.mtimeMs - req.expectedMtimeMs) > 1) {
          return {
            ok: false,
            reason: 'conflict',
            message: 'The file changed on disk since it was opened.',
          }
        }
        // Raw bytes: a normalized copy is not the file we are about to replace.
        previous = await readFile(req.path)
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
      const code = (err as NodeJS.ErrnoException).code
      log.error('save failed', { path: req.path, code, err: String(err) })
      return { ok: false, reason: 'error', message: String(err), code }
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
  // Who journals what, so one window is never offered another's live work.
  ipcMain.on('file:journal', (e, path: string, content: string) => {
    noteOwner(path, e.sender.id)
    journal(path, content)
  })
  ipcMain.handle('file:pending-recoveries', (e) =>
    recoverableFor(pendingRecoveries(), e.sender.id, (id) => {
      const wc = webContents.fromId(id)
      return wc !== undefined && !wc.isDestroyed()
    })
  )
  app.on('web-contents-created', (_e, wc) => {
    const id = wc.id
    wc.once('destroyed', () => forgetPage(id))
  })
  ipcMain.handle('file:backup-info', (_e, path: string) => backupInfo(path))
  ipcMain.handle('file:discard-recovery', (_e, path: string) => {
    forgetOwner(path)
    clearJournal(path)
  })

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

  /**
   * A save that failed.
   *
   * Modal, and an error rather than a status-bar notice: this is the one
   * message that must not be missed, because the user pressed Save and will
   * otherwise believe it worked. The detail says plainly that nothing was lost,
   * since the first fear after a failed save is that the work went with it.
   */
  ipcMain.handle(
    'file:report-save-error',
    async (e, name: string, code: string | undefined, message: string): Promise<void> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const { summary, advice } = explainSaveError(code, message)
      await dialog.showMessageBox(win!, {
        type: 'error',
        buttons: ['OK'],
        message: `"${name}" was not saved. ${summary}`,
        detail: `${advice}\n\nYour changes are still open in the editor and have not been lost.`,
      })
    }
  )

  /**
   * The file changed on disk while the user has unsaved edits to it.
   *
   * Keeping their version is the default and the cancel action: pressing Enter
   * or Escape on this dialog must never be the way someone loses their work.
   */
  ipcMain.handle('file:confirm-reload', async (e, name: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Keep My Version', 'Reload from Disk'],
      defaultId: 0,
      cancelId: 0,
      message: `"${name}" was changed by another program.`,
      detail:
        'You have unsaved changes to it. Keep My Version leaves your edits open, and saving will replace the file. Reload from Disk discards your edits and shows the other version.',
    })
    return r.response === 1
  })

  /**
   * The file changed on disk since it was opened, found at save time.
   *
   * Its own dialog rather than the close prompt, whose wording — "your changes
   * will be lost if you don't save them" — is wrong here: declining an
   * overwrite loses nothing, it leaves both versions as they are.
   */
  ipcMain.handle('file:confirm-overwrite', async (e, name: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Overwrite', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `"${name}" has changed on disk since you opened it.`,
      detail:
        'Overwrite replaces the version on disk with yours. Cancel keeps both as they are; your changes stay open in the editor.',
    })
    return r.response === 0
  })
}
