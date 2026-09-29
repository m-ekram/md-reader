/**
 * The colours a window shows before its page has painted: its background,
 * and the caption buttons Windows draws over the title bar.
 *
 * They were fixed and dark, so a light theme opened on a dark window and
 * turned light once its page loaded, and the caption buttons stayed dark until
 * the page repainted them. Main cannot read the page's stylesheets, so the
 * built-in themes' colours are listed here, and a test checks the list against
 * the stylesheets; a user theme's are read from its own file.
 */
import type { Settings } from '../shared/settings'
import { themeFor } from '../shared/theme-choice'

export interface StartupColours {
  /** The page's background: `--doc-bg`. */
  bg: string
  /** The title bar: `--chrome-bg` and `--chrome-fg`. */
  chromeBg: string
  chromeFg: string
}

export const BUILTIN_COLOURS: Record<string, StartupColours> = {
  'claude-light': { bg: '#faf9f6', chromeBg: '#2f2e2b', chromeFg: '#f2efe8' },
  github: { bg: '#ffffff', chromeBg: '#24292f', chromeFg: '#e6edf3' },
  'gruvbox-dark': { bg: '#32302f', chromeBg: '#282828', chromeFg: '#ebdbb2' },
  newsprint: { bg: '#f7f5ef', chromeBg: '#3a372f', chromeFg: '#f2efe6' },
  night: { bg: '#191b1f', chromeBg: '#15171a', chromeFg: '#d7dae0' },
  nord: { bg: '#2e3440', chromeBg: '#242933', chromeFg: '#d8dee9' },
  'one-dark': { bg: '#282c34', chromeBg: '#21252b', chromeFg: '#abb2bf' },
  pixyll: { bg: '#ffffff', chromeBg: '#1f1f1f', chromeFg: '#f0f0f0' },
  sepia: { bg: '#f4ecd8', chromeBg: '#3d3325', chromeFg: '#f4ecd8' },
  whitey: { bg: '#ffffff', chromeBg: '#fafafa', chromeFg: '#1a1a1a' },
}

const HEX = /^#[0-9a-f]{6}$/i

/** A token's value in a stylesheet, when it is a plain six-digit hex colour. */
function hexToken(css: string, token: string): string | null {
  const value = css.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1].trim()
  return value && HEX.test(value) ? value : null
}

/**
 * The colours for the theme the settings call for. `readUserTheme` reads a
 * user theme's stylesheet; anything missing or unreadable falls back to
 * Github's, which is the default theme.
 */
export function startupColours(
  settings: Settings,
  systemDark: boolean,
  readUserTheme: (id: string) => string | null
): StartupColours {
  const id = themeFor(settings, systemDark)
  const fallback = BUILTIN_COLOURS.github
  if (BUILTIN_COLOURS[id]) return BUILTIN_COLOURS[id]
  const css = readUserTheme(id)
  if (!css) return fallback
  return {
    bg: hexToken(css, 'doc-bg') ?? fallback.bg,
    chromeBg: hexToken(css, 'chrome-bg') ?? fallback.chromeBg,
    chromeFg: hexToken(css, 'chrome-fg') ?? fallback.chromeFg,
  }
}
