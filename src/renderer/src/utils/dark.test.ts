import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDarkTheme, toRgb } from './dark'

afterEach(() => document.documentElement.style.removeProperty('--doc-bg'))

const setBg = (value: string): void => document.documentElement.style.setProperty('--doc-bg', value)

describe('toRgb', () => {
  it('reads six- and three-digit hex', () => {
    expect(toRgb('#2e3440')).toEqual([46, 52, 64])
    expect(toRgb('#fff')).toEqual([255, 255, 255])
  })
})

describe('isDarkTheme', () => {
  it('calls a dark page dark and a light page light', () => {
    setBg('#191b1f')
    expect(isDarkTheme()).toBe(true)
    setBg('#ffffff')
    expect(isDarkTheme()).toBe(false)
  })

  /**
   * The point of measuring rather than listing: every built-in theme is
   * classified from its own stylesheet, so a dark theme added later cannot be
   * forgotten the way the old `'night'` check forgot every other one.
   */
  it.each([
    ['night', true],
    ['nord', true],
    ['one-dark', true],
    ['gruvbox-dark', true],
    ['github', false],
    ['whitey', false],
    ['sepia', false],
    ['newsprint', false],
  ])('classifies %s from its stylesheet', (id, dark) => {
    const css = readFileSync(join(__dirname, '..', 'themes', `${id}.css`), 'utf8')
    const bg = css.match(/--doc-bg:\s*([^;]+);/)?.[1]?.trim()
    expect(bg, `${id} defines --doc-bg`).toBeTruthy()
    setBg(bg!)
    expect(isDarkTheme()).toBe(dark)
  })
})
