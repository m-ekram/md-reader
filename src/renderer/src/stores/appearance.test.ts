import { describe, it, expect, afterEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import {
  FONT_MAX,
  FONT_MIN,
  WIDTH_MAX,
  WIDTH_MIN,
  applyAppearance,
  steppedFontSize,
  themeFontSize,
  validFontSize,
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
