/**
 * Settings persistence: a debounced JSON file in userData, broadcast to every
 * open window so multi-window stays consistent.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  mergeSettings,
  type Settings,
  type SettingsPatch,
  type SettingsState,
} from '../shared/settings'
import { log } from './log'

let cache: Settings | null = null
let flushTimer: NodeJS.Timeout | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/**
 * Reads a settings file, keeping a corrupt one rather than losing it.
 *
 * Missing is normal (the first launch) and falls back to defaults quietly.
 * Present but unparseable is different: falling back silently meant the next
 * settings write replaced the user's file, so a single bad byte — a crash
 * mid-write, a hand edit with a stray comma — cost them their whole
 * configuration. The broken file is renamed aside first, so it can be
 * repaired or restored.
 *
 * Exported for tests; `getSettings` is the caller.
 */
export function readSettingsFile(path: string, now: Date = new Date()): Settings {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    // Missing or unreadable: nothing to preserve.
    return structuredClone(DEFAULT_SETTINGS)
  }

  try {
    return mergeSettings(JSON.parse(raw))
  } catch (err) {
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    const aside = path.replace(/\.json$/, `.corrupt-${stamp}.json`)
    try {
      renameSync(path, aside)
      log.error('settings file was corrupt; kept it aside and started from defaults', {
        aside,
        err: String(err),
      })
    } catch (renameErr) {
      log.error('settings file was corrupt and could not be moved aside', {
        path,
        err: String(renameErr),
      })
    }
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  // Missing or corrupt settings must not stop the app from starting.
  cache = readSettingsFile(file())
  return cache
}

/** Counts changes, so a window can tell a stale copy from a fresh one. */
let revision = 0

/** The settings with their revision, as the renderer receives them. */
export function settingsState(): SettingsState {
  return { ...getSettings(), revision }
}

export function patchSettings(patch: SettingsPatch): Settings {
  const next = applySettingsPatch(getSettings(), patch)
  cache = next
  revision++
  scheduleFlush()
  const state = settingsState()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', state)
  }
  return next
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flushSettings, 300)
}

/**
 * Writes the settings file whole, or not at all.
 *
 * Written in place, a write cut short by a crash or a full disk left a
 * truncated file, which the next launch set aside as corrupt: every setting
 * was lost. The new text goes to a temporary file that then replaces the old
 * one. Synchronous, because it runs on the way out of the app.
 *
 * On Windows a rename over a file another program has open fails outright,
 * so it is retried briefly; if it still fails, the file is written in place
 * rather than the change being dropped. `write` is replaceable so a test can
 * cut a write short.
 */
export function writeSettingsFile(
  path: string,
  settings: Settings,
  write: typeof writeFileSync = writeFileSync
): void {
  const text = JSON.stringify(settings, null, 2)
  const tmp = `${path}.tmp`
  write(tmp, text, 'utf8')
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, path)
      return
    } catch (err) {
      if (attempt >= 4) {
        log.warn('settings rename kept failing; writing in place', { err: String(err) })
        write(path, text, 'utf8')
        rmSync(tmp, { force: true })
        return
      }
      // A short synchronous pause: this runs during quit, with no event loop.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

export function flushSettings(): void {
  if (!cache) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeSettingsFile(file(), cache)
  } catch (err) {
    log.error('settings flush failed', { err: String(err) })
  }
}

/** Keeps the most recent 15 paths, most recent first, without duplicates. */
export function addRecentFile(path: string): void {
  const recent = [path, ...getSettings().recentFiles.filter((p) => p !== path)].slice(0, 15)
  patchSettings({ recentFiles: recent })
  app.addRecentDocument(path)
}
