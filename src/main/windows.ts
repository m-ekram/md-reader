/**
 * Window registry.
 *
 * `New Window` is a first-class feature, so there is deliberately no single
 * `mainWindow` anywhere in this codebase. Each window owns its own documents and
 * tabs; anything global (settings, theme, recent files) lives in main and is
 * pushed to every window. Building the registry now costs little; retrofitting it
 * later would mean touching every store.
 */
import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { getSettings, patchSettings } from './settings'

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
    },
  })

  windows.add(win)
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

  win.on('ready-to-show', () => {
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
    if (!win.isDestroyed()) win.webContents.send('window:state', { maximized: win.isMaximized(), focused: win.isFocused() })
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
