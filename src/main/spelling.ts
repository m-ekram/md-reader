/**
 * The language spelling is checked in.
 *
 * Chromium does the checking, for the whole session, so every window follows
 * one choice. Unchosen (null), the session keeps the languages it started
 * with, which follow the system's; nothing is set at launch, so the default
 * costs nothing.
 */
import { ipcMain, session } from 'electron'
import { getSettings, patchSettings, settingsState } from './settings'

/** `lang` when it is one of the languages the session can check, else null. */
export function validLanguage(lang: unknown, available: readonly string[]): string | null {
  return typeof lang === 'string' && available.includes(lang) ? lang : null
}

/** What the session checked in before anything was chosen, to go back to. */
let startedWith: string[] | null = null

function apply(lang: string | null): void {
  const s = session.defaultSession
  startedWith ??= s.getSpellCheckerLanguages()
  s.setSpellCheckerLanguages(lang ? [lang] : startedWith)
}

/** Puts the stored choice in force; called once, before the first window. */
export function applyStoredSpellingLanguage(): void {
  const lang = validLanguage(
    getSettings().editor.spellcheckLanguage,
    session.defaultSession.availableSpellCheckerLanguages
  )
  if (lang) apply(lang)
}

export function registerSpellingIpc(): void {
  ipcMain.handle('spelling:languages', () => ({
    available: session.defaultSession.availableSpellCheckerLanguages,
    current: session.defaultSession.getSpellCheckerLanguages(),
  }))
  // Checked here: the renderer's list is only what it was shown.
  ipcMain.handle('spelling:set-language', (_e, lang: unknown) => {
    const chosen =
      lang === null
        ? null
        : validLanguage(lang, session.defaultSession.availableSpellCheckerLanguages)
    if (lang !== null && chosen === null) return settingsState()
    apply(chosen)
    patchSettings({ editor: { spellcheckLanguage: chosen } })
    return settingsState()
  })
}
