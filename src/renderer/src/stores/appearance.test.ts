import { describe, it, expect, afterEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import {
  FONT_MAX,
  FONT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  WIDTH_MAX,
  WIDTH_MIN,
  applyAppearance,
  steppedFontSize,
  themeFontSize,
  validFontFamily,
  validFontSize,
  validLineHeight,
  validWidth,
} from './appearance'

const root = document.documentElement
const editor = (patch: Partial<typeof DEFAULT_SETTINGS.editor>) => ({
  ...DEFAULT_SETTINGS.editor,
  ...patch,
})

/** A stand-in theme rule, as a theme stylesheet would set it. */
function withTheme(size: string): () => void {
  const style = document.createElement('style')
  style.textContent = `:root { --doc-font-size: ${size}; }`
  document.head.appendChild(style)
  return () => style.remove()
}

afterEach(() => {
  root.style.removeProperty('--doc-font-size')
  root.style.removeProperty('--doc-measure')
})

describe('stored values', () => {
  it('clamps sizes and widths, and rejects what is not a number', () => {
    expect(validFontSize(2)).toBe(FONT_MIN)
    expect(validFontSize(99)).toBe(FONT_MAX)
    expect(validFontSize(17.4)).toBe(17)
    expect(validFontSize('18')).toBeNull()
    expect(validFontSize(NaN)).toBeNull()

    expect(validWidth(100)).toBe(WIDTH_MIN)
    expect(validWidth(5000)).toBe(WIDTH_MAX)
    expect(validWidth('full')).toBe('full')
    expect(validWidth('wide')).toBeNull()
  })
})

describe('applyAppearance', () => {
  it('overrides the theme on the root element, and hands it back when cleared', () => {
    applyAppearance(editor({ fontSize: 20, contentWidth: 1200 }))
    expect(root.style.getPropertyValue('--doc-font-size')).toBe('20px')
    expect(root.style.getPropertyValue('--doc-measure')).toBe('1200px')

    applyAppearance(editor({ fontSize: null, contentWidth: null }))
    expect(root.style.getPropertyValue('--doc-font-size')).toBe('')
    expect(root.style.getPropertyValue('--doc-measure')).toBe('')
  })

  it('lifts the column limit entirely for full width', () => {
    applyAppearance(editor({ contentWidth: 'full' }))
    expect(root.style.getPropertyValue('--doc-measure')).toBe('none')
  })
})

describe('fonts and line height', () => {
  afterEach(() => {
    for (const p of ['--doc-font', '--code-font', '--doc-line-height']) root.style.removeProperty(p)
  })

  it('takes a font by name, and refuses what would break out of the declaration', () => {
    expect(validFontFamily('  Georgia ')).toBe('Georgia')
    expect(validFontFamily('Cascadia Code')).toBe('Cascadia Code')
    expect(validFontFamily('Noto Sans CJK JP')).toBe('Noto Sans CJK JP')
    expect(validFontFamily('')).toBeNull()
    expect(validFontFamily('Arial; color: red')).toBeNull()
    expect(validFontFamily("Arial', x")).toBeNull()
    expect(validFontFamily('a}b')).toBeNull()
    expect(validFontFamily('x'.repeat(65))).toBeNull()
    expect(validFontFamily(12)).toBeNull()
  })

  it('keeps line height between 1 and 2.5', () => {
    expect(validLineHeight(1.6)).toBe(1.6)
    expect(validLineHeight(0.5)).toBe(LINE_HEIGHT_MIN)
    expect(validLineHeight(9)).toBe(LINE_HEIGHT_MAX)
    expect(validLineHeight(1.234)).toBe(1.25)
    expect(validLineHeight('2')).toBeNull()
  })

  it('overrides the theme’s fonts and spacing, with a fallback, and hands them back', () => {
    applyAppearance(editor({ fontFamily: 'Georgia', codeFontFamily: 'Consolas', lineHeight: 2 }))
    expect(root.style.getPropertyValue('--doc-font')).toBe('"Georgia", system-ui, sans-serif')
    expect(root.style.getPropertyValue('--code-font')).toBe('"Consolas", ui-monospace, monospace')
    expect(root.style.getPropertyValue('--doc-line-height')).toBe('2')

    applyAppearance(editor({ fontFamily: null, codeFontFamily: null, lineHeight: null }))
    expect(root.style.getPropertyValue('--doc-font')).toBe('')
    expect(root.style.getPropertyValue('--code-font')).toBe('')
    expect(root.style.getPropertyValue('--doc-line-height')).toBe('')
  })
})

describe('font size steps', () => {
  it('reads the theme size from under an override, and leaves the override in place', () => {
    const remove = withTheme('17px')
    try {
      applyAppearance(editor({ fontSize: 24 }))
      expect(themeFontSize()).toBe(17)
      expect(root.style.getPropertyValue('--doc-font-size')).toBe('24px')
    } finally {
      remove()
    }
  })

  it('steps from the theme size when none is chosen, and stops at the limits', () => {
    const remove = withTheme('17px')
    try {
      expect(steppedFontSize(editor({ fontSize: null }), 1)).toBe(18)
      expect(steppedFontSize(editor({ fontSize: FONT_MAX }), 1)).toBe(FONT_MAX)
      expect(steppedFontSize(editor({ fontSize: FONT_MIN }), -1)).toBe(FONT_MIN)
    } finally {
      remove()
    }
  })
})
