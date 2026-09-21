/**
 * Settings persistence: a debounced JSON file in userData, broadcast to every
 * open window so multi-window stays consistent.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../shared/settings'
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

export function patchSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  cache = next
  scheduleFlush()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', next)
  }
  return next
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flushSettings, 300)
}

export function flushSettings(): void {
  if (!cache) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8')
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
