import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DocumentFile, SaveRequest, SaveResult, WindowState } from '../shared/ipc'
import type { SettingsPatch, SettingsState } from '../shared/settings'
import type { BackupInfo, JournalEntry, VersionInfo } from '../main/recovery'
import type { DirEntry, MarkdownFile } from '../main/workspace'
import type { FileProperties, SearchFlags } from '../main/ipc/workspace'
import type { SearchHit } from '../main/search-worker'
import type { PreviewFile, ReplaceResult, ReplaceSpec } from '../main/replace'
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
    /** The versions kept of a file, newest first. */
    versions: (path: string): Promise<VersionInfo[]> => ipcRenderer.invoke('file:versions', path),
    /** One version's text, decoded; null when there is no such version. */
    versionContent: (path: string, id: string): Promise<string | null> =>
      ipcRenderer.invoke('file:version-content', path, id),
    discardRecovery: (path: string): Promise<void> =>
      ipcRenderer.invoke('file:discard-recovery', path),
    /** Asks what to do with work recovered after a crash. */
    recoveryPrompt: (labels: string[]): Promise<'restore' | 'later' | 'review' | 'discard'> =>
      ipcRenderer.invoke('recovery:prompt', labels),
    onOpenPath: (fn: (path: string) => void) => subscribe('file:open-path', fn),
    /** Where a dropped file is on disk; empty when it has no path. */
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
    /**
     * Files the window was opened with, asked for once the page is listening,
     * and whether this window reopens the last session.
     */
    takePendingPaths: (): Promise<{ paths: string[]; restoreSession: boolean }> =>
      ipcRenderer.invoke('file:take-pending-paths'),
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
    start: (query: string, opts: SearchFlags = {}): Promise<number> =>
      ipcRenderer.invoke('search:start', query, opts),
    cancel: (): Promise<void> => ipcRenderer.invoke('search:cancel'),
    /** The files a replace would change, leaving out `open` (the page has those). */
    previewReplace: (spec: ReplaceSpec, open: string[]): Promise<PreviewFile[]> =>
      ipcRenderer.invoke('replace:preview', spec, open),
    applyReplace: (
      spec: ReplaceSpec,
      files: Array<{ path: string; mtimeMs: number }>
    ): Promise<ReplaceResult> => ipcRenderer.invoke('replace:apply', spec, files),
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
    /** Opens a file this session exported; resolves to an error message, or ''. */
    open: (path: string): Promise<string> => ipcRenderer.invoke('export:open', path),
  },

  fileops: {
    properties: (path: string): Promise<FileProperties> =>
      ipcRenderer.invoke('fileops:properties', path),
    move: (path: string): Promise<string | null> => ipcRenderer.invoke('fileops:move', path),
    delete: (path: string): Promise<boolean> => ipcRenderer.invoke('fileops:delete', path),
    parentDir: (path: string): Promise<string> => ipcRenderer.invoke('fileops:parent-dir', path),
    /** In the open folder only; `.md` is added. Resolves to the new file's path. */
    createFile: (dir: string, name: string): Promise<string> =>
      ipcRenderer.invoke('fileops:create-file', dir, name),
    createFolder: (dir: string, name: string): Promise<string> =>
      ipcRenderer.invoke('fileops:create-folder', dir, name),
    /** A file or folder in the open folder; resolves to its new path. */
    rename: (path: string, name: string): Promise<string> =>
      ipcRenderer.invoke('fileops:rename', path, name),
    /** To the Recycle Bin, after asking; false when the answer was no. */
    trash: (path: string): Promise<boolean> => ipcRenderer.invoke('fileops:trash', path),
  },

  settings: {
    get: (): Promise<SettingsState> => ipcRenderer.invoke('settings:get'),
    patch: (patch: SettingsPatch): Promise<SettingsState> =>
      ipcRenderer.invoke('settings:patch', patch),
    onChanged: (fn: (s: SettingsState) => void) => subscribe('settings:changed', fn),
  },

  themes: {
    list: (): Promise<Array<{ id: string; name: string; builtin: boolean }>> =>
      ipcRenderer.invoke('themes:list'),
    read: (id: string): Promise<string> => ipcRenderer.invoke('themes:read', id),
    onChanged: (fn: () => void) => subscribe('themes:changed', fn),
  },

  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    /** Paints the caption buttons Windows draws in the theme's title bar colours. */
    captionColours: (color: string, symbolColor: string): void =>
      ipcRenderer.send('window:caption-colours', color, symbolColor),
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
    /** Tells main the close request arrived, before any question is asked. */
    ackClose: (): void => ipcRenderer.send('window:close-ack'),
  },

  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    /** A yes-or-no question; Escape answers with `cancel`. */
    confirm: (message: string, detail?: string, ok?: string, cancel?: string): Promise<boolean> =>
      ipcRenderer.invoke('app:confirm', message, detail, ok, cancel),
    info: (message: string, detail?: string): Promise<void> =>
      ipcRenderer.invoke('app:info', message, detail),
    /** Errors from the page, into main.log beside main's own. */
    logError: (message: string): void => ipcRenderer.send('app:log-error', message),
    /** The About box, with the logo. */
    about: (): Promise<void> => ipcRenderer.invoke('app:about'),
    /** Whether Windows is in dark mode, and word when that changes. */
    systemDark: (): Promise<boolean> => ipcRenderer.invoke('app:system-dark'),
    onSystemDarkChanged: (fn: (dark: boolean) => void) => subscribe('app:system-dark', fn),
  },

  /**
   * Writes text, with HTML beside it when given, through main. The page's own
   * clipboard refuses a write while its window is not the focused one.
   */
  clipboard: {
    write: (data: { text: string; html?: string }): Promise<void> =>
      ipcRenderer.invoke('clipboard:write', data),
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
