/**
 * Updates, from the project's GitHub Releases.
 *
 * Nothing happens behind the user's back. A check that finds a newer version
 * says so (the page shows it, stores/updates.ts); only Download fetches it;
 * only Restart now restarts, and that closes every window through the usual
 * close negotiation first, so unsaved work is asked about as on any close.
 * Downloaded and left, an update is installed when the app next quits, and the
 * app is not started again.
 *
 * One check runs on its own, a while after the first window is ready, so it
 * stays off the start-up path; Help ▸ Check Updates… runs one at any time. None
 * in development, none under test (EKRAM_NO_UPDATES), and none at start-up when
 * Preferences says not to.
 *
 * The portable zip has no installer to run, so for it a newer version is a link
 * to its release page.
 *
 * electron-updater is loaded on the first check, not at launch: it pulls in a
 * dozen modules main does not otherwise need.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import { getSettings } from './settings'
import { log } from './log'
import { RELEASES_URL } from '../shared/project'
import type { UpdateEvent } from '../shared/updates'

/** How long after the first window is ready the start-up check waits. */
export const STARTUP_DELAY_MS = 10_000

/** The installer leaves its uninstaller beside the app; the zip has none. */
const UNINSTALLER = 'Uninstall ekram.md.exe'

export function updatesSupported(): boolean {
  return app.isPackaged && !process.env.EKRAM_NO_UPDATES
}

export function isInstalled(exeDir = dirname(app.getPath('exe'))): boolean {
  return existsSync(join(exeDir, UNINSTALLER))
}

let loaded: Promise<AppUpdater> | null = null

function updater(): Promise<AppUpdater> {
  loaded ??= import('electron-updater').then(({ autoUpdater }) => {
    // Asked, never assumed: no download until Download, no install on quit
    // until something was downloaded.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = {
      info: (m: unknown) => log.info(`updates: ${String(m)}`),
      warn: (m: unknown) => log.warn(`updates: ${String(m)}`),
      error: (m: unknown) => log.error(`updates: ${String(m)}`),
      debug: () => {},
    }
    return autoUpdater
  })
  return loaded
}

/** The version found by the last check, if newer than this one. */
let found: string | null = null
let downloaded = false
/** Restart now was chosen, and the windows are closing for it. */
let restarting = false
let startupDone = false

function send(event: UpdateEvent): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('updates:event', event)
}

/** Looks for a newer version; `asked` when the user asked, who then hears either way. */
export async function checkForUpdates(asked: boolean): Promise<void> {
  if (!updatesSupported()) {
    if (asked) send({ kind: 'unsupported' })
    return
  }
  try {
    const result = await (await updater()).checkForUpdates()
    if (!result?.isUpdateAvailable) {
      if (asked) send({ kind: 'none', version: app.getVersion() })
      return
    }
    found = result.updateInfo.version
    send(
      downloaded
        ? { kind: 'ready', version: found }
        : { kind: 'available', version: found, installable: isInstalled() }
    )
  } catch (err) {
    log.warn('update check failed', { message: String(err) })
    if (asked)
      send({ kind: 'error', message: 'Could not reach the update server. Try again later.' })
  }
}

/** Fetches the version found, once the user has said to. */
export async function downloadUpdate(): Promise<void> {
  if (!found || downloaded || !isInstalled()) return
  const u = await updater()
  // The user wants it, so it is installed at the next quit if they do not
  // restart for it first. Set before the download: electron-updater adds its
  // install-on-quit hook as the download finishes, and only if this is on.
  u.autoInstallOnAppQuit = true
  try {
    await u.downloadUpdate()
    downloaded = true
    send({ kind: 'ready', version: found })
  } catch (err) {
    u.autoInstallOnAppQuit = false
    log.warn('update download failed', { message: String(err) })
    send({ kind: 'error', message: 'The update could not be downloaded. Try again later.' })
  }
}

/**
 * Restart now: every window is asked to close, as on any close, so unsaved
 * work is asked about. The install happens once the last one has gone
 * (installIfRestarting); a window kept open calls it off (restartDeclined).
 */
export function restartToUpdate(): void {
  if (!downloaded) return
  restarting = true
  for (const w of BrowserWindow.getAllWindows()) w.close()
}

/** Called when the last window has closed; true when it is installing instead of quitting. */
export async function installIfRestarting(): Promise<boolean> {
  if (!restarting)
    return false
    // Silently, then started again: the restart the user asked for.
  ;(await updater()).quitAndInstall(true, true)
  return true
}

/** A window answered Cancel to closing: the restart is off. */
export function restartDeclined(): void {
  restarting = false
}

export function registerUpdateIpc(): void {
  // Sent by the page once it has painted; only the first window's counts.
  ipcMain.on('updates:startup', () => {
    if (startupDone) return
    startupDone = true
    if (!getSettings().checkForUpdates) return
    setTimeout(() => void checkForUpdates(false), STARTUP_DELAY_MS)
  })
  ipcMain.handle('updates:check', () => checkForUpdates(true))
  ipcMain.handle('updates:download', () => downloadUpdate())
  ipcMain.on('updates:restart', () => restartToUpdate())
  ipcMain.on('updates:open-release', () => {
    void shell.openExternal(found ? `${RELEASES_URL}/tag/v${found}` : RELEASES_URL)
  })
}

/** For tests: forgets what this run has found, downloaded and been asked. */
export function resetForTests(): void {
  found = null
  downloaded = false
  restarting = false
  startupDone = false
  loaded = null
}
