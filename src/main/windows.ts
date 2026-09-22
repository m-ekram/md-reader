/**
 * Window registry.
 *
 * `New Window` is a first-class feature, so there is deliberately no single
 * `mainWindow` anywhere in this codebase. Each window owns its own documents and
 * tabs; anything global (settings, theme, recent files) lives in main and is
 * pushed to every window. Building the registry now costs little; retrofitting it
 * later would mean touching every store.
 */
import { BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { getSettings, patchSettings } from './settings'
import { flushJournals } from './recovery'
import { log } from './log'
import { mark } from './startup'

/** A second crash inside this window is treated as a crash loop, not bad luck. */
const CRASH_LOOP_MS = 30_000

const windows = new Set<BrowserWindow>()

/**
 * Every window restores the same persisted bounds, so without an offset a second
 * window lands exactly on top of the first and looks like nothing happened.
 */
const CASCADE_STEP = 28
function cascadeOffset(): { dx: number; dy: number } {
  const n = windows.size
  return { dx: n * CASCADE_STEP, dy: n * CASCADE_STEP }
}

export function allWindows(): BrowserWindow[] {
  return [...windows]
}

export function createWindow(openPath?: string): BrowserWindow {
  const saved = getSettings().window

  const { dx, dy } = cascadeOffset()
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x === undefined ? undefined : saved.x + dx,
    y: saved.y === undefined ? undefined : saved.y + dy,
    minWidth: 560,
    minHeight: 400,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1f2430',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: getSettings().editor.spellcheck,
      // Keep compiled code from the first launch for the next, rather than
      // waiting for a script to be seen several times first. The renderer
      // bundle is large and identical on every launch.
      v8CacheOptions: 'bypassHeatCheck',
    },
  })

  windows.add(win)
  mark('windowCreated')

  // Zoom is the document's text size, never the page's: the chrome stays the
  // same size at any zoom. Chromium remembers a page zoom per origin, so a
  // level left by an older version is cleared, and pinching is turned off.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomLevel(0)
    void win.webContents.setVisualZoomLevelLimits(1, 1)
  })
  if (saved.maximized) win.maximize()

  // Links open in the user's browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })

  /**
   * The renderer crashed.
   *
   * Without this the window simply goes blank and stays that way. Unsaved work
   * is safe — it is journalled as the user types — but only if the journal is
   * flushed before anything else happens, and only if the user is brought back
   * to a working window where recovery can be offered. Reloading does both:
   * the boot path already offers journalled work back.
   *
   * A second crash soon after is reported instead of reloaded, so a document
   * that crashes the renderer on load cannot trap the user in a reload loop.
   */
  let lastCrash = 0
  win.webContents.on('render-process-gone', (_e, details) => {
    // A normal shutdown also ends the process; only a real crash is handled.
    if (details.reason === 'clean-exit') return

    log.error('renderer gone', { reason: details.reason, exitCode: details.exitCode })
    flushJournals()
    if (win.isDestroyed()) return

    const now = Date.now()
    const looping = now - lastCrash < CRASH_LOOP_MS
    lastCrash = now

    if (looping) {
      void dialog.showMessageBox(win, {
        type: 'error',
        buttons: ['OK'],
        message: 'ekram.md stopped working again.',
        detail:
          'Your unsaved changes were kept and will be offered back the next time the app starts. Close this window and open the app again.',
      })
      return
    }
    win.reload()
  })

  win.on('ready-to-show', () => {
    mark('shown')
    win.show()
    if (openPath) win.webContents.send('file:open-path', openPath)
  })

  const persistBounds = () => {
    if (win.isDestroyed()) return
    // Only the focused window owns the remembered geometry; otherwise a
    // cascaded window would save its offset and the cascade would compound.
    if (!win.isFocused()) return
    const maximized = win.isMaximized()
    // Only record real bounds when not maximized, so unmaximizing restores sanely.
    if (!maximized) {
      const b = win.getBounds()
      patchSettings({ window: { ...b, maximized } })
    } else {
      patchSettings({ window: { ...getSettings().window, maximized } })
    }
  }
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)
  win.on('maximize', persistBounds)
  win.on('unmaximize', persistBounds)

  // Window chrome is drawn in the renderer, so it needs to track these.
  const sendState = () => {
    if (!win.isDestroyed())
      win.webContents.send('window:state', {
        maximized: win.isMaximized(),
        focused: win.isFocused(),
      })
  }
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
  win.on('focus', sendState)
  win.on('blur', sendState)

  win.on('closed', () => windows.delete(win))

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export function windowFromEvent(sender: Electron.WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}
