// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { chooseMenu, nextFrames, useApp } from './helpers'

/**
 * Following Windows' light or dark mode: off unless switched on, and then a
 * theme for each mode, changed as Windows changes.
 *
 * Windows' mode is played by `nativeTheme.themeSource`: main reads the mode
 * from nativeTheme, and setting its source is how the mode changes under it.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

async function setSystemMode(mode: 'light' | 'dark'): Promise<void> {
  await ctx.app.evaluate(({ nativeTheme }, m) => {
    nativeTheme.themeSource = m
  }, mode)
  // Heard by the page before anything is asserted about what it did with it:
  // main sends the change before it answers this, and the page gets both in
  // order.
  expect(await ctx.page.evaluate(() => window.api.app.systemDark())).toBe(mode === 'dark')
}

const currentTheme = () =>
  ctx.page.evaluate(() => document.documentElement.getAttribute('data-theme'))

async function follow(on: boolean): Promise<void> {
  await ctx.page.evaluate(async (v) => {
    const s = await window.api.settings.get()
    await window.api.settings.patch({ followSystem: { ...s.followSystem, enabled: v } })
  }, on)
}

describe('following Windows light or dark mode', () => {
  it('is off unless switched on', async () => {
    await setSystemMode('light')
    expect(await currentTheme()).toBe('github')

    await setSystemMode('dark')
    await nextFrames(ctx)
    expect(await currentTheme()).toBe('github')
  })

  it('uses the dark theme in dark mode and the light one in light mode', async () => {
    await follow(true)
    await expect.poll(currentTheme).toBe('night')

    await setSystemMode('light')
    await expect.poll(currentTheme).toBe('github')

    await setSystemMode('dark')
    await expect.poll(currentTheme).toBe('night')
  })

  it('makes a theme chosen while following the one for the mode in use', async () => {
    // Dark mode now: choosing Nord makes Nord the dark theme, not the only one.
    await chooseMenu(ctx, 'Themes', 'Nord')
    await expect.poll(currentTheme).toBe('nord')

    await setSystemMode('light')
    await expect.poll(currentTheme).toBe('github')
    await setSystemMode('dark')
    await expect.poll(currentTheme).toBe('nord')
  })

  it('keeps following after a restart', async () => {
    await ctx.page.reload()
    await ctx.page.waitForSelector('.app', { timeout: 30_000 })
    await expect.poll(currentTheme, { timeout: 15_000 }).toBe('nord')
  })

  it('goes back to the chosen theme when switched off', async () => {
    await follow(false)
    await expect.poll(currentTheme).toBe('github')
    await setSystemMode('light')
  })
})
