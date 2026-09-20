import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_THEMES } from '../../../main/themes'

/**
 * A built-in theme has to be registered in three places: the list main reports,
 * a stylesheet file, and the export's own map of theme CSS. Miss the third and
 * everything looks right on screen while exports come out styled as Github —
 * which is precisely the kind of silent, partial wiring a test is for.
 */
const THEME_DIR = __dirname
const PAYLOAD = readFileSync(join(THEME_DIR, '..', 'export', 'payload.ts'), 'utf8')
const RENDERER_MAIN = readFileSync(join(THEME_DIR, '..', 'main.ts'), 'utf8')

/** The tokens a theme must define for the document to be readable at all. */
const REQUIRED_TOKENS = [
  '--doc-bg',
  '--doc-fg',
  '--doc-accent',
  '--code-bg',
  '--quote-bar',
  '--table-border',
  '--chrome-bg',
  '--chrome-fg',
  '--menu-bg',
  '--menu-fg',
  '--sidebar-bg',
  '--status-bg',
]

describe.each(BUILTIN_THEMES.map((t) => t.id))('theme %s', (id) => {
  const file = join(THEME_DIR, `${id}.css`)

  it('has a stylesheet', () => {
    expect(existsSync(file), `${id}.css is missing`).toBe(true)
  })

  it('scopes every rule to its own data-theme attribute', () => {
    const css = readFileSync(file, 'utf8')
    // A theme that leaked an unscoped rule would restyle every other theme.
    const selectors = css.match(/^[^@\s][^{]*\{/gm) ?? []
    for (const selector of selectors) {
      expect(selector, `${id} has an unscoped rule`).toContain(`[data-theme='${id}']`)
    }
  })

  it('defines the tokens the document depends on', () => {
    const css = readFileSync(file, 'utf8')
    for (const token of REQUIRED_TOKENS) {
      expect(css, `${id} does not define ${token}`).toContain(token)
    }
  })

  it('is loaded by the renderer', () => {
    expect(RENDERER_MAIN).toContain(`./themes/${id}.css`)
  })

  it('is available to the exporter', () => {
    // Without this the theme applies on screen and exports as something else.
    expect(PAYLOAD).toContain(`../themes/${id}.css?inline`)
    expect(PAYLOAD).toMatch(new RegExp(`['"]?${id}['"]?:\\s`))
  })
})

describe('the theme folder', () => {
  it('contains nothing that is not a built-in or the contract', () => {
    const known = new Set([...BUILTIN_THEMES.map((t) => `${t.id}.css`), 'contract.css'])
    const stray = readdirSync(THEME_DIR).filter((f) => f.endsWith('.css') && !known.has(f))
    expect(stray, 'a stylesheet here that no theme lists is dead').toEqual([])
  })
})
