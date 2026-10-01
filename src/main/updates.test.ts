import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Updates are asked for, never assumed: nothing downloads until Download,
 * nothing restarts until Restart now, and a window kept open calls the restart
 * off. electron-updater and Electron are stood in for.
 */

const sent: unknown[] = []
const windows = [
  { close: vi.fn(), webContents: { send: (_c: string, e: unknown) => sent.push(e) } },
]
let exeDir = ''

const app = {
  isPackaged: true,
  getPath: () => join(exeDir, 'ekram-md.exe'),
  getVersion: () => '1.0.0',
}
vi.mock('electron', () => ({
  app,
  BrowserWindow: { getAllWindows: () => windows },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

const autoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  logger: null as unknown,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
}
vi.mock('electron-updater', () => ({ autoUpdater }))
vi.mock('./settings', () => ({ getSettings: () => ({ checkForUpdates: true }) }))
vi.mock('./log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const updates = await import('./updates')

const newer = { isUpdateAvailable: true, updateInfo: { version: '1.1.0' } }

beforeEach(async () => {
  exeDir = await mkdtemp(join(tmpdir(), 'ekmd-updates-'))
  sent.length = 0
  windows[0].close.mockClear()
  for (const f of [
    autoUpdater.checkForUpdates,
    autoUpdater.downloadUpdate,
    autoUpdater.quitAndInstall,
  ]) {
    f.mockReset()
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  app.isPackaged = true
  delete process.env.EKRAM_NO_UPDATES
  updates.resetForTests()
})

afterEach(() => rm(exeDir, { recursive: true, force: true }))

/** As the installer leaves it; the portable zip has no uninstaller. */
const installed = () => writeFile(join(exeDir, 'Uninstall ekram.md.exe'), '')

describe('checking', () => {
  it('does nothing in development or under test, and says so when asked', async () => {
    app.isPackaged = false
    await updates.checkForUpdates(true)
    process.env.EKRAM_NO_UPDATES = '1'
    app.isPackaged = true
    await updates.checkForUpdates(true)
    expect(sent).toEqual([{ kind: 'unsupported' }, { kind: 'unsupported' }])
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('offers a newer version without downloading it', async () => {
    await installed()
    autoUpdater.checkForUpdates.mockResolvedValue(newer)
    await updates.checkForUpdates(false)
    expect(sent).toEqual([{ kind: 'available', version: '1.1.0', installable: true }])
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('offers the portable zip a link, not an install', async () => {
    autoUpdater.checkForUpdates.mockResolvedValue(newer)
    await updates.checkForUpdates(false)
    expect(sent).toEqual([{ kind: 'available', version: '1.1.0', installable: false }])
    await updates.downloadUpdate()
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('stays quiet about nothing new, or a failure, unless asked', async () => {
    autoUpdater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: false })
    await updates.checkForUpdates(false)
    autoUpdater.checkForUpdates.mockRejectedValue(new Error('offline'))
    await updates.checkForUpdates(false)
    expect(sent).toEqual([])

    await updates.checkForUpdates(true)
    autoUpdater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: false })
    await updates.checkForUpdates(true)
    expect(sent).toEqual([
      { kind: 'error', message: expect.stringContaining('update server') },
      { kind: 'none', version: '1.0.0' },
    ])
  })
})

describe('downloading and installing', () => {
  beforeEach(async () => {
    await installed()
    autoUpdater.checkForUpdates.mockResolvedValue(newer)
    await updates.checkForUpdates(false)
    sent.length = 0
  })

  it('installs at the next quit once downloaded: the hook is armed before the download ends', async () => {
    let armedDuringDownload: boolean | undefined
    autoUpdater.downloadUpdate.mockImplementation(async () => {
      armedDuringDownload = autoUpdater.autoInstallOnAppQuit
    })
    await updates.downloadUpdate()
    expect(armedDuringDownload).toBe(true)
    expect(sent).toEqual([{ kind: 'ready', version: '1.1.0' }])
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installs nothing at quit when the download failed', async () => {
    autoUpdater.downloadUpdate.mockRejectedValue(new Error('disconnected'))
    await updates.downloadUpdate()
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(sent).toEqual([{ kind: 'error', message: expect.stringContaining('downloaded') }])
  })

  it('restarts only when asked, and only once every window has closed', async () => {
    updates.restartToUpdate()
    expect(windows[0].close).not.toHaveBeenCalled()

    autoUpdater.downloadUpdate.mockResolvedValue(undefined)
    await updates.downloadUpdate()
    expect(await updates.installIfRestarting()).toBe(false)

    updates.restartToUpdate()
    expect(windows[0].close).toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(await updates.installIfRestarting()).toBe(true)
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('calls the restart off when a window is kept open', async () => {
    autoUpdater.downloadUpdate.mockResolvedValue(undefined)
    await updates.downloadUpdate()
    updates.restartToUpdate()
    updates.restartDeclined()
    // Closed later, by hand: an ordinary quit, which installs without restarting.
    expect(await updates.installIfRestarting()).toBe(false)
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})
