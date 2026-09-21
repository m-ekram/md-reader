/**
 * Theme discovery. Built-in themes ship with the app; user themes are plain CSS
 * files dropped into the config folder and picked up without a restart.
 */
import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, watch } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
/** Filename-safe ids only: no separators, so nothing can name another folder. */
const THEME_ID = /^[\w.-]+$/

/**
 * Reads a user theme's stylesheet by id.
 *
 * The id arrives from the renderer and becomes part of a path, so it is held
 * to a filename-safe shape, and the resolved file must still sit directly in
 * the themes folder. Joined as-is, `../secret` read a stylesheet from outside
 * it. Anything that fails either check reads as no theme at all.
 */
export function readUserTheme(id: string): string {
  const dir = userThemeDir()
  if (!THEME_ID.test(id) || id.startsWith('.')) {
    log.warn('refused theme id', { id })
    return ''
  }
  const p = join(dir, `${id}.css`)
  if (dirname(resolve(p)) !== resolve(dir)) {
    log.warn('refused theme path outside the themes folder', { id })
    return ''
  }
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
