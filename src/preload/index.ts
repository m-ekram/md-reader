import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentFile, SaveRequest, SaveResult, WindowState } from '../shared/ipc'
import type { Settings } from '../shared/settings'
import type { BackupInfo, JournalEntry } from '../main/recovery'
import type { DirEntry, MarkdownFile } from '../main/workspace'
import type { FileProperties } from '../main/ipc/workspace'
import type { SearchHit } from '../main/search-worker'
import type { WatchEvent } from '../main/watcher'
import type { SaveImageRequest, SaveImageResult } from '../main/ipc/images'
import type { ExportResult } from '../main/ipc/export'
import type { HelpDoc } from '../main/ipc/help'
import type { ExportPayload } from '../main/export/html'

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
    confirmReload: (name: string): Promise<boolean> =>
      ipcRenderer.invoke('file:confirm-reload', name),
    confirmOverwrite: (name: string): Promise<boolean> =>
      ipcRenderer.invoke('file:confirm-overwrite', name),
    reportSaveError: (name: string, code: string | undefined, message: string): Promise<void> =>
      ipcRenderer.invoke('file:report-save-error', name, code, message),
    /** Fire-and-forget: journalling must never block a keystroke. */
    journal: (path: string, content: string): void =>
      ipcRenderer.send('file:journal', path, content),
    pendingRecoveries: (): Promise<JournalEntry[]> => ipcRenderer.invoke('file:pending-recoveries'),
    backupInfo: (path: string): Promise<BackupInfo> => ipcRenderer.invoke('file:backup-info', path),
    discardRecovery: (path: string): Promise<void> =>
      ipcRenderer.invoke('file:discard-recovery', path),
    onOpenPath: (fn: (path: string) => void) => subscribe('file:open-path', fn),
    /** Files the window was opened with, asked for once the page is listening. */
    takePendingPaths: (): Promise<string[]> => ipcRenderer.invoke('file:take-pending-paths'),
  },

  workspace: {
    openDialog: (): Promise<string | null> => ipcRenderer.invoke('workspace:open-dialog'),
    current: (): Promise<string | null> => ipcRenderer.invoke('workspace:current'),
    set: (root: string | null): Promise<string | null> => ipcRenderer.invoke('workspace:set', root),
    readDir: (dir: string): Promise<DirEntry[]> => ipcRenderer.invoke('workspace:read-dir', dir),
    allMarkdown: (root?: string): Promise<MarkdownFile[]> =>
      ipcRenderer.invoke('workspace:all-markdown', root),
    onWatchEvents: (fn: (events: WatchEvent[]) => void) => subscribe('watcher:events', fn),
  },

  search: {
    start: (query: string, caseSensitive?: boolean): Promise<number> =>
      ipcRenderer.invoke('search:start', query, caseSensitive),
    cancel: (): Promise<void> => ipcRenderer.invoke('search:cancel'),
    onHit: (fn: (payload: { id: number; hit: SearchHit }) => void) => subscribe('search:hit', fn),
    onDone: (fn: (payload: { id: number; found: number }) => void) => subscribe('search:done', fn),
  },

  edit: {
    /** Menu-driven editing actions; the keystrokes belong to the editor. */
    action: (
      name: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pastePlain' | 'selectAll' | 'delete'
    ): void => ipcRenderer.send('edit:action', name),
  },

  images: {
    save: (req: SaveImageRequest): Promise<SaveImageResult> =>
      ipcRenderer.invoke('images:save', req),
  },

  help: {
    topic: (id: string): Promise<HelpDoc | null> => ipcRenderer.invoke('help:topic', id),
  },

  export: {
    html: (payload: ExportPayload): Promise<ExportResult> =>
      ipcRenderer.invoke('export:html', payload),
    pdf: (payload: ExportPayload): Promise<ExportResult> =>
      ipcRenderer.invoke('export:pdf', payload),
    print: (payload: ExportPayload): Promise<ExportResult> =>
      ipcRenderer.invoke('export:print', payload),
  },

  fileops: {
    properties: (path: string): Promise<FileProperties> =>
      ipcRenderer.invoke('fileops:properties', path),
    move: (path: string): Promise<string | null> => ipcRenderer.invoke('fileops:move', path),
    delete: (path: string): Promise<boolean> => ipcRenderer.invoke('fileops:delete', path),
    parentDir: (path: string): Promise<string> => ipcRenderer.invoke('fileops:parent-dir', path),
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    patch: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke('settings:patch', patch),
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
    setSpellcheck: (enabled: boolean): void => ipcRenderer.send('window:spellcheck', enabled),
    onState: (fn: (s: WindowState) => void) => subscribe('window:state', fn),
    /** Main asks the renderer whether it may close; renderer replies. */
    onCloseRequest: (fn: () => void) => subscribe('window:close-request', fn),
    replyClose: (allow: boolean): void => ipcRenderer.send('window:close-reply', allow),
  },

  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    confirm: (message: string, detail?: string): Promise<boolean> =>
      ipcRenderer.invoke('app:confirm', message, detail),
    info: (message: string, detail?: string): Promise<void> =>
      ipcRenderer.invoke('app:info', message, detail),
    /** The About box, with the logo. */
    about: (): Promise<void> => ipcRenderer.invoke('app:about'),
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
