/**
 * Settings persistence: a debounced JSON file in userData, broadcast to every
 * open window so multi-window stays consistent.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../shared/settings'
import { log } from './log'

let cache: Settings | null = null
let flushTimer: NodeJS.Timeout | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    cache = mergeSettings(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    // Missing or corrupt settings must not stop the app from starting.
    cache = structuredClone(DEFAULT_SETTINGS)
  }
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
