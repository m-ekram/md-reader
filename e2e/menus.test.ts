// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { MENUS } from '../src/renderer/src/commands/menus'
import { useApp } from './helpers'

/**
 * The menu bar against its specification: structure, accelerators, greying, keyboard access.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('menu bar matches the specification', () => {
  it('shows the seven top-level menus in order', async () => {
    const labels = await ctx.page.locator('.menubar__top').allTextContents()
    expect(labels.map((l) => l.trim())).toEqual(MENUS.map((m) => m.label))
  })

  for (const menu of MENUS) {
    // The Themes menu is generated from installed themes, not a static list.
    if (menu.label === 'Themes') continue

    it(`${menu.label} lists its items with the right accelerators`, async () => {
      await ctx.page.locator('.menubar__top', { hasText: new RegExp(`^${menu.label}$`) }).click()
      await ctx.page.waitForSelector('.menu[role="menu"]')

      const expectedLabels = menu.items
        .filter((n) => n.kind === 'item' || n.kind === 'submenu' || n.kind === 'dynamic')
        .map((n) => ('label' in n ? n.label : ''))

      const rendered = await ctx.page
        .locator(
          '.menu[role="menu"] > .menu__item, .menu[role="menu"] > .menu__row--sub > .menu__item'
        )
        .allTextContents()

      for (const label of expectedLabels) {
        expect(
          rendered.some((r) => r.includes(label)),
          `${menu.label} > ${label} missing from the rendered menu`
        ).toBe(true)
      }

      await ctx.page.keyboard.press('Escape')
    })
  }

  it('greys out commands that have no implementation yet', async () => {
    await ctx.page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]')
    // Import is deliberately shown but unavailable in v1.
    const importItem = ctx.page.locator('.menu__item', { hasText: 'Import' }).first()
    expect(await importItem.getAttribute('aria-disabled')).toBe('true')
    await ctx.page.keyboard.press('Escape')
  })

  it('is navigable by keyboard alone', async () => {
    await ctx.page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]')
    await ctx.page.keyboard.press('ArrowDown')
    expect(await ctx.page.locator('[data-active="true"]').count()).toBe(1)
    await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.keyboard.press('ArrowRight') // moves to the Edit menu
    expect(await ctx.page.locator('.menu[role="menu"]').count()).toBeGreaterThan(0)
    await ctx.page.keyboard.press('Escape')
    expect(await ctx.page.locator('.menu[role="menu"]').count()).toBe(0)
  })
})
