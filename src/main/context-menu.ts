/**
 * The right-click menu.
 *
 * There was none: a misspelled word was underlined with no way to fix it, and
 * cut, copy and paste were keyboard-only. It is a native menu, built from what
 * Chromium reports about the click, so spelling suggestions come from the
 * system spell checker.
 *
 * `buildContextMenu` is pure — what the click was, in; a menu template, out —
 * with the effects passed in, so it can be tested without Electron.
 */
import type { MenuItemConstructorOptions } from 'electron'

/** The parts of Electron's context-menu parameters the menu uses. */
export interface ContextParams {
  x: number
  y: number
  isEditable: boolean
  selectionText: string
  misspelledWord: string
  dictionarySuggestions: string[]
  linkURL: string
  mediaType: string
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
}

export interface ContextActions {
  replaceMisspelling(word: string): void
  addToDictionary(word: string): void
  openLink(url: string): void
  copyText(text: string): void
  copyImageAt(x: number, y: number): void
}

/** Suggestions are capped: a long list pushes Cut and Copy off a small screen. */
const MAX_SUGGESTIONS = 5

export function buildContextMenu(
  p: ContextParams,
  act: ContextActions
): MenuItemConstructorOptions[] {
  const groups: MenuItemConstructorOptions[][] = []

  if (p.isEditable && p.misspelledWord) {
    const suggestions = p.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)
    groups.push([
      ...(suggestions.length > 0
        ? suggestions.map((s) => ({ label: s, click: () => act.replaceMisspelling(s) }))
        : [{ label: 'No suggestions', enabled: false }]),
      {
        label: `Add “${p.misspelledWord}” to Dictionary`,
        click: () => act.addToDictionary(p.misspelledWord),
      },
    ])
  }

  // Only web links leave the app; anything else is not opened from here.
  if (/^https?:\/\//i.test(p.linkURL)) {
    groups.push([
      { label: 'Open Link', click: () => act.openLink(p.linkURL) },
      { label: 'Copy Link', click: () => act.copyText(p.linkURL) },
    ])
  }

  if (p.mediaType === 'image') {
    groups.push([{ label: 'Copy Image', click: () => act.copyImageAt(p.x, p.y) }])
  }

  if (p.isEditable) {
    groups.push([
      { role: 'cut', enabled: p.editFlags.canCut },
      { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: p.editFlags.canSelectAll },
    ])
  } else if (p.selectionText.trim()) {
    groups.push([{ role: 'copy', enabled: p.editFlags.canCopy }])
  }

  return groups.flatMap((g, i) => (i === 0 ? g : [{ type: 'separator' as const }, ...g]))
}
