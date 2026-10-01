import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
} from 'electron'
import { mark } from './startup'
import { installCrashHandlers, log } from './log'
import { flushSettings, getSettings, patchSettings, settingsState } from './settings'
import { allWindows, createWindow, OVERLAY_CAPTIONS, openPaths, takePendingPaths } from './windows'
import { markdownArgs } from './args'
import { registerFileIpc } from './ipc/files'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerImageIpc } from './ipc/images'
import { registerExportIpc } from './ipc/export'
import { registerHelpIpc } from './ipc/help'
import { stopWatching, watchRoot } from './watcher'
import { cancelAllSearches } from './search'
import { listThemes, readUserTheme, watchUserThemes } from './themes'
import { flushJournals } from './recovery'
import { applyStoredSpellingLanguage, registerSpellingIpc } from './spelling'
import { installIfRestarting, registerUpdateIpc, restartDeclined } from './updates'
import type { SettingsPatch } from '../shared/settings'
import { REPOSITORY_URL } from '../shared/project'
import icon from '../../resources/icon.png?asset'

installCrashHandlers()

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
      openPaths(win, files)
    } else {
      createWindow(files)
    }
  })

  app.whenReady().then(() => {
    mark('appReady')
    app.setAppUserModelId('com.ekram.md')
    // Electron's default menu is never shown (the window is frameless and
    // draws its own), but its accelerators stayed live: Ctrl+Plus, Ctrl+Minus
    // and Ctrl+0 zoomed the whole page, title bar included, whenever the app's
    // own use of those keys was not enabled. Every key the app answers to is
    // bound by the renderer; on Windows the editing keys need no menu.
    Menu.setApplicationMenu(null)

    registerFileIpc()
    registerWorkspaceIpc()
    registerImageIpc()
    registerExportIpc()
    registerHelpIpc()
    registerSettingsIpc()
    registerThemeIpc()
    registerWindowIpc()
    registerAppIpc()
    registerSpellingIpc()
    registerUpdateIpc()
    applyStoredSpellingLanguage()

    createWindow(markdownArgs(process.argv))

    // Watchers start once the window is on its way, not before it: the
    // renderer lists the folder itself on launch, and these only report later
    // changes, so the window has no reason to wait for them.
    setImmediate(() => {
      watchUserThemes()
      // Reopen the last workspace so later changes to it are picked up.
      const savedWorkspace = getSettings().workspace
      if (savedWorkspace) watchRoot(savedWorkspace)
      mark('watchersStarted')
    })

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

// Unless the last window closed for Restart now, which installs and restarts.
app.on('window-all-closed', () => {
  void installIfRestarting().then((installing) => {
    if (!installing) app.quit()
  })
})
app.on('before-quit', () => {
  quitting = true
  flushJournals()
  flushSettings()
  cancelAllSearches()
  void stopWatching()
})

function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => settingsState())
  ipcMain.handle('settings:patch', (_e, patch: SettingsPatch) => {
    patchSettings(patch)
    return settingsState()
  })
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

  // The page asks once it listens, and gets the files it would have missed.
  ipcMain.handle('file:take-pending-paths', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    return w ? takePendingPaths(w) : { paths: [], restoreSession: false }
  })
  ipcMain.on('window:minimize', (e) => senderWindow(e)?.minimize())
  // The theme's title bar colours, for the caption buttons Windows draws.
  // Checked before use: they come from the page's CSS, which a user theme
  // supplies.
  ipcMain.on('window:caption-colours', (e, color: unknown, symbolColor: unknown) => {
    const css = (v: unknown): v is string =>
      typeof v === 'string' && v.length < 64 && /^[#\w(),.%\s-]+$/.test(v)
    const w = senderWindow(e)
    if (!OVERLAY_CAPTIONS || !w || !css(color) || !css(symbolColor)) return
    try {
      w.setTitleBarOverlay({ color, symbolColor })
    } catch (err) {
      log.warn('caption colours refused', { color, symbolColor, err: String(err) })
    }
  })
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

  const standDown = (w: BrowserWindow): void => {
    const t = closeTimers.get(w)
    if (t) {
      clearTimeout(t)
      closeTimers.delete(w)
    }
  }
  // The page heard the request. From here the user's answer may take as long
  // as it takes: the timer below is only for a page that cannot answer at all.
  ipcMain.on('window:close-ack', (e) => {
    const w = senderWindow(e)
    if (w) standDown(w)
  })
  ipcMain.on('window:close-reply', (e, allow: boolean) => {
    const w = senderWindow(e)
    if (!w) return
    standDown(w)
    // Kept open, for unsaved work: a restart to update waits for another time.
    if (!allow) restartDeclined()
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
      // Give it a moment, then go anyway. A page that is alive acknowledges at
      // once (window:close-ack), which stops this: the reply itself waits on
      // the user, who once lost the window mid-question after four seconds.
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
  // Windows keeps its own list, shown in the taskbar's jump list, fed by
  // addRecentFile; forgotten there too, or the files stay a right-click away.
  ipcMain.handle('app:clear-recent', () => {
    patchSettings({ recentFiles: [] })
    app.clearRecentDocuments()
  })

  // Whether Windows is in dark mode, for themes that follow it. Read here, not
  // from the page's prefers-color-scheme: measured, that did not follow the
  // system's mode, while nativeTheme did, and says when it changes.
  ipcMain.handle('app:system-dark', () => nativeTheme.shouldUseDarkColors)
  nativeTheme.on('updated', () => {
    for (const w of allWindows()) {
      if (!w.isDestroyed()) w.webContents.send('app:system-dark', nativeTheme.shouldUseDarkColors)
    }
  })
  // Copy As and Copy Code. Through main because the page's clipboard refuses
  // a write while its window is not the focused one.
  ipcMain.handle('clipboard:write', async (_e, data: { text: string; html?: string }) => {
    const item: Record<string, string> = { 'text/plain': String(data?.text ?? '') }
    if (typeof data?.html === 'string') item['text/html'] = data.html
    await clipboard.write([new ClipboardItem(item)])
  })

  ipcMain.on('app:log-error', (_e, message: string) => {
    log.error('renderer', { message: String(message).slice(0, 4000) })
  })

  // Its own handler rather than app:info, which also carries error messages:
  // only About shows the logo.
  ipcMain.handle('app:about', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { response } = await dialog.showMessageBox(win ?? undefined!, {
      type: 'none',
      icon: nativeImage.createFromPath(icon).resize({ width: 64, height: 64 }),
      buttons: ['OK', 'Website'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: 'ekram.md',
      detail: [
        `Version ${app.getVersion()}`,
        'A WYSIWYG markdown editor for Windows.',
        '',
        '© 2026 Muhammad Ekram. Released under the MIT licence.',
      ].join('\n'),
    })
    if (response === 1) await shell.openExternal(REPOSITORY_URL)
  })

  // Native dialogs rather than window.confirm/alert: those block the renderer
  // and look nothing like the rest of the application.
  // The second button is always the one Escape answers with, so it must be the
  // choice that changes nothing.
  ipcMain.handle(
    'app:confirm',
    async (e, message: string, detail?: string, ok = 'OK', cancel = 'Cancel') => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const r = await dialog.showMessageBox(win ?? undefined!, {
        type: 'question',
        buttons: [String(ok), String(cancel)],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message,
        detail,
      })
      return r.response === 0
    }
  )

  /**
   * Unsaved work found after a crash: restore it, keep it for later, or, asked
   * twice, throw it away.
   *
   * Escape answers a message box with its cancel button, and that used to be
   * Discard, so dismissing the question deleted the work it was offering back.
   * Dismissing now means Not Now: the work stays on disk and is offered again.
   */
  ipcMain.handle(
    'recovery:prompt',
    async (e, labels: string[]): Promise<'restore' | 'later' | 'review' | 'discard'> => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!
      const several = labels.length > 1
      const r = await dialog.showMessageBox(win, {
        type: 'question',
        message: 'Unsaved changes were recovered',
        detail: several
          ? `${labels.join('\n')}\n\nRestore them? Not Now keeps them, to be offered again.`
          : `${labels[0]}\n\nRestore the recovered version? Not Now keeps it, to be offered again.`,
        buttons: several
          ? ['Restore All', 'Not Now', 'Review…']
          : ['Restore', 'Not Now', 'Discard…'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      if (r.response === 0) return 'restore'
      if (r.response !== 2) return 'later'
      if (several) return 'review'

      const sure = await dialog.showMessageBox(win, {
        type: 'warning',
        message: 'Discard the recovered changes?',
        detail: `${labels[0]}\n\nThey cannot be recovered again.`,
        buttons: ['Keep Them', 'Discard'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      return sure.response === 1 ? 'discard' : 'later'
    }
  )

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
