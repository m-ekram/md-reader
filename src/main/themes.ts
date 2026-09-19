/**
 * Theme discovery. Built-in themes ship with the app; user themes are plain CSS
 * files dropped into the config folder and picked up without a restart.
 */
import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import { log } from './log'

export interface ThemeInfo {
  id: string
  name: string
  builtin: boolean
}

/** Shipped themes, in the order the Themes menu lists them. */
export const BUILTIN_THEMES: ThemeInfo[] = [
  { id: 'claude-light', name: 'Claude Light', builtin: true },
  { id: 'github', name: 'Github', builtin: true },
  { id: 'newsprint', name: 'Newsprint', builtin: true },
  { id: 'night', name: 'Night', builtin: true },
  { id: 'pixyll', name: 'Pixyll', builtin: true },
  { id: 'whitey', name: 'Whitey', builtin: true },
]

/** Themes implemented so far; the rest are listed but disabled until Phase 5. */
export const IMPLEMENTED_THEMES = new Set(['github', 'night'])

export function userThemeDir(): string {
  const d = join(app.getPath('userData'), 'themes')
  mkdirSync(d, { recursive: true })
  return d
}

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function listThemes(): ThemeInfo[] {
  const user: ThemeInfo[] = []
  try {
    for (const f of readdirSync(userThemeDir())) {
      if (!f.endsWith('.css')) continue
      const id = f.slice(0, -4)
      if (BUILTIN_THEMES.some((t) => t.id === id)) continue
      user.push({ id, name: titleCase(id), builtin: false })
    }
  } catch (err) {
    log.warn('user theme scan failed', { err: String(err) })
  }
  return [...BUILTIN_THEMES, ...user.sort((a, b) => a.name.localeCompare(b.name))]
}

/** Returns the CSS for a user theme; built-ins are bundled in the renderer. */
export function readUserTheme(id: string): string {
  const p = join(userThemeDir(), `${id}.css`)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

export function watchUserThemes(): void {
  try {
    watch(userThemeDir(), { persistent: false }, () => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('themes:changed')
    })
  } catch (err) {
    log.warn('theme watch failed', { err: String(err) })
  }
}
