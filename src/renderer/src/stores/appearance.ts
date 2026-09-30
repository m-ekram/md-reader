/**
 * The reader's own text size and column width, laid over the theme's.
 *
 * Each theme sets `--doc-font-size` and `--doc-measure`. A choice made here is
 * written as an inline style on the root element, which outranks any
 * stylesheet rule, so it holds across theme switches; clearing it hands the
 * value back to the theme. Only the document reads these tokens: the chrome is
 * sized in pixels, so a larger text size never grows the title or tab bar.
 *
 * Exports are built from the theme stylesheets alone and keep the theme's
 * measure — a printed page reads best at a column width, whatever the window's.
 *
 * Pure: the settings store applies these and stores the reader's choices.
 */
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/settings'

export const FONT_MIN = 10
export const FONT_MAX = 32
export const WIDTH_MIN = 600
export const WIDTH_MAX = 1800

type Editor = Settings['editor']

/** A stored font size, or null when it is absent or not a usable number. */
export function validFontSize(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, v)))
    : null
}

/** A stored width: pixels, 'full', or null for the theme's own. */
export function validWidth(v: unknown): number | 'full' | null {
  if (v === 'full') return 'full'
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, v)))
    : null
}

export const LINE_HEIGHT_MIN = 1
export const LINE_HEIGHT_MAX = 2.5

/**
 * A font family name, or null when there is none or it is not one.
 *
 * Only a name: letters, digits, spaces and a few marks. It goes into a CSS
 * value, where a quote, semicolon or brace would end the declaration and
 * start another.
 */
export function validFontFamily(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim()
  return /^[\p{L}\p{N} ._-]{1,64}$/u.test(name) ? name : null
}

/** A stored line height, to the nearest 0.05, or null. */
export function validLineHeight(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const clamped = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, v))
  return Math.round(clamped * 20) / 20
}

function setOrClear(name: string, value: string | null): void {
  const root = document.documentElement.style
  if (value === null) root.removeProperty(name)
  else root.setProperty(name, value)
}

/** Writes the reader's choices onto the root element, or clears them. */
export function applyAppearance(editor: Editor = DEFAULT_SETTINGS.editor): void {
  const size = validFontSize(editor.fontSize)
  setOrClear('--doc-font-size', size === null ? null : `${size}px`)

  const width = validWidth(editor.contentWidth)
  setOrClear('--doc-measure', width === null ? null : width === 'full' ? 'none' : `${width}px`)

  // A fallback of the same kind, for a font this machine does not have.
  const text = validFontFamily(editor.fontFamily)
  setOrClear('--doc-font', text === null ? null : `"${text}", system-ui, sans-serif`)
  const code = validFontFamily(editor.codeFontFamily)
  setOrClear('--code-font', code === null ? null : `"${code}", ui-monospace, monospace`)

  const lineHeight = validLineHeight(editor.lineHeight)
  setOrClear('--doc-line-height', lineHeight === null ? null : String(lineHeight))
}

/**
 * The size the theme in force would use, in pixels.
 *
 * Read with the override lifted for a moment, since while it is set the
 * computed value is the override's. Synchronous, so nothing is painted in
 * between.
 */
export function themeFontSize(): number {
  const root = document.documentElement
  const override = root.style.getPropertyValue('--doc-font-size')
  root.style.removeProperty('--doc-font-size')
  const value = getComputedStyle(root).getPropertyValue('--doc-font-size').trim()
  if (override) root.style.setProperty('--doc-font-size', override)
  const px = parseFloat(value)
  return Number.isFinite(px) && value.endsWith('px') ? px : 16
}

/** The size in force: the reader's if set, else the theme's. */
export function effectiveFontSize(editor: Editor): number {
  return validFontSize(editor.fontSize) ?? themeFontSize()
}

/** The font size one step up or down from what is showing, clamped. */
export function steppedFontSize(editor: Editor, delta: number): number {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, effectiveFontSize(editor) + delta))
}

/**
 * Shows or hides the formatting toolbar in every editor at once. It is built
 * in all of them and only hidden, so toggling keeps each editor's undo history.
 */
export function applyToolbar(visible: boolean): void {
  document.documentElement.classList.toggle('show-toolbar', visible)
}
