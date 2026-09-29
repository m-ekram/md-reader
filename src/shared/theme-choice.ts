/**
 * Which theme a window shows: the one chosen, or, when following Windows'
 * light or dark mode, the one chosen for the mode Windows is in.
 *
 * Shared so main, which colours the window before its page has loaded, picks
 * the same theme the page then shows.
 */
import type { Settings } from './settings'

export function themeFor(s: Settings, dark: boolean): string {
  if (!s.followSystem.enabled) return s.theme
  return dark ? s.followSystem.dark : s.followSystem.light
}
