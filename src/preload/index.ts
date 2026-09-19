import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentFile, SaveRequest, SaveResult, WindowState } from '../shared/ipc'
import type { Settings } from '../shared/settings'
import type { JournalEntry } from '../main/recovery'

/**
 * The entire surface the renderer is allowed to reach. Everything touching the
 * filesystem or the OS lives in main; this is the only door between them.
 */
const api = {
  file: {
    openDialog: (): Promise<DocumentFile[] | null> => ipcRenderer.invoke('file:open-dialog'),
    read: (path: string): Promise<DocumentFile> => ipcRenderer.invoke('file:read', path),
    save: (req: SaveRequest): Promise<SaveResult> => ipcRenderer.invoke('file:save', req),
    saveAsDialog: (suggested?: string): Promise<string | null> =>
      ipcRenderer.invoke('file:save-as-dialog', suggested),
    showInFolder: (path: string): Promise<void> => ipcRenderer.invoke('file:show-in-folder', path),
    confirmClose: (names: string[]): Promise<'save' | 'discard' | 'cancel'> =>
      ipcRenderer.invoke('file:confirm-close', names),
    /** Fire-and-forget: journalling must never block a keystroke. */
    journal: (path: string, content: string): void => ipcRenderer.send('file:journal', path, content),
    pendingRecoveries: (): Promise<JournalEntry[]> => ipcRenderer.invoke('file:pending-recoveries'),
    discardRecovery: (path: string): Promise<void> => ipcRenderer.invoke('file:discard-recovery', path),
    onOpenPath: (fn: (path: string) => void) => subscribe('file:open-path', fn),
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    patch: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:patch', patch),
    onChanged: (fn: (s: Settings) => void) => subscribe('settings:changed', fn),
  },

  themes: {
    list: (): Promise<Array<{ id: string; name: string; builtin: boolean }>> =>
      ipcRenderer.invoke('themes:list'),
    read: (id: string): Promise<string> => ipcRenderer.invoke('themes:read', id),
    onChanged: (fn: () => void) => subscribe('themes:changed', fn),
  },

  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    newWindow: (): void => ipcRenderer.send('window:new'),
    setAlwaysOnTop: (on: boolean): void => ipcRenderer.send('window:always-on-top', on),
    toggleFullscreen: (): void => ipcRenderer.send('window:fullscreen'),
    toggleDevTools: (): void => ipcRenderer.send('window:devtools'),
    setZoom: (level: number): void => ipcRenderer.send('window:zoom', level),
    onState: (fn: (s: WindowState) => void) => subscribe('window:state', fn),
    /** Main asks the renderer whether it may close; renderer replies. */
    onCloseRequest: (fn: () => void) => subscribe('window:close-request', fn),
    replyClose: (allow: boolean): void => ipcRenderer.send('window:close-reply', allow),
  },

  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  },
}

/** Returns an unsubscribe function, so components can clean up on unmount. */
function subscribe(channel: string, fn: (...args: never[]) => void): () => void {
  const listener = (_e: unknown, ...args: unknown[]) => (fn as (...a: unknown[]) => void)(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
