import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { installCrashHandlers, log } from './log'
import { flushSettings, getSettings, patchSettings } from './settings'
import { allWindows, createWindow } from './windows'
import { registerFileIpc } from './ipc/files'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerImageIpc } from './ipc/images'
import { stopWatching, watchRoot } from './watcher'
import { cancelAllSearches } from './search'
import { listThemes, readUserTheme, watchUserThemes } from './themes'
import { flushJournals } from './recovery'
import type { Settings } from '../shared/settings'

installCrashHandlers()

/** Markdown paths passed on the command line, e.g. by "Open with". */
function markdownArgs(argv: string[]): string[] {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && /\.(md|markdown|mdown|mkd|txt)$/i.test(a) && existsSync(a))
}

// A second launch hands its files to the running instance instead of starting
// a rival process with its own settings and journal.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const files = markdownArgs(argv)
    const win = allWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      for (const f of files) win.webContents.send('file:open-path', f)
    } else {
      createWindow(files[0])
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.ekram.md')

    registerFileIpc()
    registerWorkspaceIpc()
    registerImageIpc()
    registerSettingsIpc()
    registerThemeIpc()
    registerWindowIpc()
    registerAppIpc()
    watchUserThemes()

    // Reopen the last workspace so the sidebar is populated on launch.
    const savedWorkspace = getSettings().workspace
    if (savedWorkspace) watchRoot(savedWorkspace)

    const files = markdownArgs(process.argv)
    createWindow(files[0])
    for (const extra of files.slice(1)) {
      allWindows()[0]?.webContents.send('file:open-path', extra)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

/**
 * Once a quit is under way the close negotiation must stand down. It works by
 * cancelling the close and asking the renderer first, and cancelling a close
 * during a quit cancels the quit itself - which would leave the app refusing to
 * exit, including during an OS shutdown.
 */
let quitting = false

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  quitting = true
  flushJournals()
  flushSettings()
  cancelAllSearches()
  void stopWatching()
})

function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:patch', (_e, patch: Partial<Settings>) => patchSettings(patch))
}

function registerThemeIpc(): void {
  ipcMain.handle('themes:list', () => listThemes())
  ipcMain.handle('themes:read', (_e, id: string) => readUserTheme(id))
}

/**
 * Close is a negotiation: main asks the renderer, which may need to prompt about
 * unsaved work, and only then is the window allowed to go.
 */
const closing = new WeakSet<BrowserWindow>()
const closeTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>()

function registerWindowIpc(): void {
  const senderWindow = (e: Electron.IpcMainEvent) => BrowserWindow.fromWebContents(e.sender)

  ipcMain.on('window:minimize', (e) => senderWindow(e)?.minimize())
  ipcMain.on('window:toggle-maximize', (e) => {
    const w = senderWindow(e)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window:close', (e) => senderWindow(e)?.close())
  ipcMain.on('window:new', () => createWindow())
  ipcMain.on('window:always-on-top', (e, on: boolean) => senderWindow(e)?.setAlwaysOnTop(on))
  ipcMain.on('window:fullscreen', (e) => {
    const w = senderWindow(e)
    w?.setFullScreen(!w.isFullScreen())
  })
  ipcMain.on('window:devtools', (e) => e.sender.toggleDevTools())

  /**
   * Spell checking is Chromium's, not ours: the dictionaries and the red
   * underline come free with the renderer session. Only the switch is here.
   */
  ipcMain.on('window:spellcheck', (e, enabled: boolean) => {
    e.sender.session.setSpellCheckerEnabled(enabled)
  })

  /**
   * Editing actions the menu offers but must never bind as accelerators.
   *
   * The keystrokes belong to the editor (see EDITOR_DELEGATED in the renderer's
   * registry), but clicking the menu item still has to work. webContents
   * applies these to whatever has focus, which is the right target.
   */
  ipcMain.on('edit:action', (e, action: string) => {
    const wc = e.sender
    switch (action) {
      case 'undo':
        wc.undo()
        break
      case 'redo':
        wc.redo()
        break
      case 'cut':
        wc.cut()
        break
      case 'copy':
        wc.copy()
        break
      case 'paste':
        wc.paste()
        break
      case 'pastePlain':
        wc.pasteAndMatchStyle()
        break
      case 'selectAll':
        wc.selectAll()
        break
      case 'delete':
        wc.delete()
        break
    }
  })
  ipcMain.on('window:zoom', (e, level: number) => e.sender.setZoomLevel(level))

  ipcMain.on('window:close-reply', (e, allow: boolean) => {
    const w = senderWindow(e)
    if (!w) return
    const t = closeTimers.get(w)
    if (t) {
      clearTimeout(t)
      closeTimers.delete(w)
    }
    if (allow) {
      closing.add(w)
      w.destroy()
    }
  })

  app.on('browser-window-created', (_e, win) => {
    win.on('close', (event) => {
      if (closing.has(win) || quitting) return
      event.preventDefault()
      win.webContents.send('window:close-request')

      // If the renderer has crashed, or has not mounted its listener yet, no
      // reply will ever arrive and the window becomes impossible to close.
      // Give it a moment, then go anyway.
      const bail = setTimeout(() => {
        if (!win.isDestroyed()) {
          log.warn('close negotiation timed out; closing anyway')
          closing.add(win)
          win.destroy()
        }
      }, 4000)
      closeTimers.set(win, bail)
    })
  })
}

function registerAppIpc(): void {
  ipcMain.handle('app:open-external', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      log.warn('refused to open non-http url', { url })
      return
    }
    await shell.openExternal(url)
  })
  ipcMain.handle('app:version', () => app.getVersion())

  // Native dialogs rather than window.confirm/alert: those block the renderer
  // and look nothing like the rest of the application.
  ipcMain.handle('app:confirm', async (e, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showMessageBox(win ?? undefined!, {
      type: 'question',
      buttons: ['Restore', 'Discard'],
      defaultId: 0,
      cancelId: 1,
      message,
      detail,
    })
    return r.response === 0
  })

  ipcMain.handle('app:info', async (e, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    await dialog.showMessageBox(win ?? undefined!, {
      type: 'info',
      buttons: ['OK'],
      message,
      detail,
    })
  })
}
