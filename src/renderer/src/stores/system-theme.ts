/**
 * Which theme is showing: the one chosen, or, when following Windows' light
 * or dark mode, the one chosen for the mode Windows is in.
 *
 * Choosing a theme while following sets it for the mode in use, so picking a
 * dark theme at night does not also take over the day.
 */
import { watch } from 'vue'
import type { Settings } from '../../../shared/settings'
import { patchSettings, useSettingsStore } from './settings'
import { applyTheme, useThemeStore } from './theme'

let systemDark = false

/** The theme a window should show. Pure, for testing. */
export function themeFor(s: Settings, dark: boolean): string {
  if (!s.followSystem.enabled) return s.theme
  return dark ? s.followSystem.dark : s.followSystem.light
}

/** Shows the theme the settings and Windows' mode call for, if not already. */
async function sync(): Promise<void> {
  const themes = useThemeStore()
  let want = themeFor(useSettingsStore().value, systemDark)
  // A theme removed since it was chosen: the default, not a page with none.
  if (!themes.available.some((t) => t.id === want)) want = 'github'
  if (want !== themes.current) await applyTheme(want)
}

/** Reads Windows' mode and starts following it; returns the theme to start with. */
export async function initSystemTheme(): Promise<string> {
  systemDark = await window.api.app.systemDark()
  window.api.app.onSystemDarkChanged((dark) => {
    systemDark = dark
    void sync()
  })
  const settings = useSettingsStore()
  watch(
    () => JSON.stringify([settings.value.theme, settings.value.followSystem]),
    () => void sync()
  )
  return themeFor(settings.value, systemDark)
}

/** Chooses a theme, from the Themes menu or Preferences. */
export async function chooseTheme(id: string): Promise<void> {
  const s = useSettingsStore().value
  await applyTheme(id)
  if (s.followSystem.enabled) {
    await patchSettings({
      followSystem: { ...s.followSystem, [systemDark ? 'dark' : 'light']: id },
    })
  } else {
    await patchSettings({ theme: id })
  }
}
