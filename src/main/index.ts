import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { existsSync } from 'node:fs'
import { installCrashHandlers, log } from './log'
import { flushSettings, getSettings, patchSettings } from './settings'
import { allWindows, createWindow } from './windows'
import { registerFileIpc } from './ipc/files'
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
    registerSettingsIpc()
    registerThemeIpc()
    registerWindowIpc()
    registerAppIpc()
    watchUserThemes()

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

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  flushJournals()
  flushSettings()
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

function registerWindowIpc(): void {
  const senderWindow = (e: Electron.IpcMainEvent) => BrowserWindow.fromWebContents(e.sender)

  ipcMain.on('window:minimize', (e) => senderWindow(e)?.minimize())
  ipcMain.on('window:toggle-maximize', (e) => {
    const w = senderWindow(e)
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.on('window:close', (e) => senderWindow(e)?.close())
  ipcMain.on('window:new', () => createWindow())
  ipcMain.on('window:always-on-top', (e, on: boolean) => senderWindow(e)?.setAlwaysOnTop(on))
  ipcMain.on('window:fullscreen', (e) => {
    const w = senderWindow(e)
    w?.setFullScreen(!w.isFullScreen())
  })
  ipcMain.on('window:devtools', (e) => e.sender.toggleDevTools())
  ipcMain.on('window:zoom', (e, level: number) => e.sender.setZoomLevel(level))

  ipcMain.on('window:close-reply', (e, allow: boolean) => {
    const w = senderWindow(e)
    if (!w) return
    if (allow) {
      closing.add(w)
      w.destroy()
    }
  })

  app.on('browser-window-created', (_e, win) => {
    win.on('close', (event) => {
      if (closing.has(win)) return
      event.preventDefault()
      win.webContents.send('window:close-request')
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
  ipcMain.handle('app:message', (e, opts: Electron.MessageBoxOptions) =>
    dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender)!, opts)
  )
}
