import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'
import { BUILTIN_COLOURS, startupColours } from './theme-colours'

/**
 * The window's colours before its page paints. Main cannot read the page's
 * stylesheets, so it keeps its own list of the built-in themes' colours; these
 * check the list against the stylesheets, so a theme changed there cannot
 * leave the window opening in its old colours.
 */
const THEMES = join(__dirname, '..', 'renderer', 'src', 'themes')
const token = (css: string, name: string) =>
  css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()

const settings = (over: Partial<Settings>): Settings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...over,
})

describe('the built-in themes’ startup colours', () => {
  const contract = readFileSync(join(THEMES, 'contract.css'), 'utf8')
  for (const [id, colours] of Object.entries(BUILTIN_COLOURS)) {
    it(`match ${id}.css`, () => {
      const css = readFileSync(join(THEMES, `${id}.css`), 'utf8')
      const value = (name: string) => token(css, name) ?? token(contract, name)
      expect(colours).toEqual({
        bg: value('doc-bg'),
        chromeBg: value('chrome-bg'),
        chromeFg: value('chrome-fg'),
      })
    })
  }
})

describe('which colours a window opens in', () => {
  const noUserThemes = () => null

  it('the chosen theme’s', () => {
    expect(startupColours(settings({ theme: 'night' }), false, noUserThemes)).toBe(
      BUILTIN_COLOURS.night
    )
  })

  it('the theme for Windows’ mode, when following it', () => {
    const s = settings({ followSystem: { enabled: true, light: 'sepia', dark: 'nord' } })
    expect(startupColours(s, true, noUserThemes)).toBe(BUILTIN_COLOURS.nord)
    expect(startupColours(s, false, noUserThemes)).toBe(BUILTIN_COLOURS.sepia)
  })

  it('a user theme’s, read from its stylesheet, with the default for what it leaves out', () => {
    const css = ":root[data-theme='mine'] { --doc-bg: #102030; --chrome-bg: #405060; }"
    expect(startupColours(settings({ theme: 'mine' }), false, () => css)).toEqual({
      bg: '#102030',
      chromeBg: '#405060',
      chromeFg: BUILTIN_COLOURS.github.chromeFg,
    })
  })

  it('the default theme’s, for a theme that has gone', () => {
    expect(startupColours(settings({ theme: 'gone' }), false, () => '')).toBe(
      BUILTIN_COLOURS.github
    )
  })
})
