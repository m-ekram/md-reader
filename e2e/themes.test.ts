// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * Themes, asserted on computed colour rather than on the setting.
 *
 * A theme that is listed, selected and stored while nothing on screen changes
 * would satisfy every check made on state alone — and four of these six had no
 * stylesheet at all until now, so that failure was real rather than imagined.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const THEMES = [
  'Claude Light',
  'Github',
  'Gruvbox Dark',
  'Newsprint',
  'Night',
  'Nord',
  'One Dark',
  'Pixyll',
  'Sepia',
  'Whitey',
]

/**
 * Locates a theme by its label element.
 *
 * Not by the item's text: the active theme's item also contains a checkmark
 * span, so an exact-text match on the item finds every theme except the one
 * currently selected.
 */
function themeItem(name: string) {
  return ctx.page
    .locator('.menu[role="menu"] .menu__item')
    .filter({ has: ctx.page.locator('.menu__label', { hasText: new RegExp(`^${name}$`) }) })
    .first()
}

async function openThemesMenu(): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.locator('.menubar__top', { hasText: /^Themes$/ }).click()
  await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
}

async function chooseTheme(name: string): Promise<void> {
  await openThemesMenu()
  await themeItem(name).click()
  await ctx.page.waitForTimeout(400)
}

/** What the document surface actually renders as. */
function documentColours(): Promise<{ bg: string; fg: string }> {
  return ctx.page.evaluate(() => {
    const el = document.querySelector('.editor-scroll') as HTMLElement
    const style = getComputedStyle(el)
    return { bg: style.backgroundColor, fg: style.color }
  })
}

describe('themes', () => {
  it('opens a document to look at', async () => {
    const file = join(ctx.workdir, 'themed.md')
    await writeFile(file, '# Themed\n\nSome text.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Themed')
  })

  it('offers every built-in theme, none of them disabled', async () => {
    await openThemesMenu()

    for (const name of THEMES) {
      const item = themeItem(name)
      expect(await item.count(), `${name} is missing from the Themes menu`).toBe(1)
      expect(await item.getAttribute('aria-disabled'), `${name} is greyed out`).toBe('false')
    }
    await ctx.page.keyboard.press('Escape')
  })

  it('gives each theme its own appearance', async () => {
    const seen = new Map<string, string>()

    for (const name of THEMES) {
      await chooseTheme(name)
      const { bg } = await documentColours()
      expect(bg, `${name} left the document with no background`).not.toBe('')
      expect(bg, `${name} is transparent`).not.toBe('rgba(0, 0, 0, 0)')
      seen.set(name, bg)
    }

    // Github and Whitey are both plain white by design, so the assertion is
    // that the set is mostly distinct rather than entirely.
    expect(new Set(seen.values()).size).toBeGreaterThanOrEqual(8)
  })

  it('darkens the chrome for the dark theme, not just the document', async () => {
    await chooseTheme('Night')
    const dark = await ctx.page.evaluate(() => {
      const bar = document.querySelector('.titlebar, .menubar') as HTMLElement
      return getComputedStyle(bar).backgroundColor
    })
    const { bg } = await documentColours()

    // The rule the contract exists for: a dark theme carries the whole window.
    const brightness = (c: string): number =>
      (c.match(/\d+/g) ?? ['255', '255', '255']).slice(0, 3).reduce((a, n) => a + Number(n), 0)
    expect(brightness(bg), 'Night document is not dark').toBeLessThan(300)
    expect(brightness(dark), 'Night left the chrome light').toBeLessThan(300)
  })

  it('gives a dark theme a dark source view, not only Night', async () => {
    // Dark themes were recognised by name, and the only name was 'night', so
    // every later dark theme showed a white source editor on a dark window.
    await chooseTheme('Nord')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.cm-editor', { timeout: 15_000 })

    const bg = await ctx.page.evaluate(
      () => getComputedStyle(document.querySelector('.cm-editor')!).backgroundColor
    )
    const brightness = (c: string): number =>
      (c.match(/\d+/g) ?? ['255', '255', '255']).slice(0, 3).reduce((a, n) => a + Number(n), 0)
    expect(brightness(bg), `source view under Nord is ${bg}`).toBeLessThan(300)

    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.ProseMirror', { timeout: 15_000 })
  })

  it('remembers the choice across a restart', async () => {
    await chooseTheme('Newsprint')
    const before = await ctx.page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    )
    expect(before).toBe('newsprint')

    await ctx.page.reload()
    await ctx.page.waitForSelector('.app', { timeout: 30_000 })
    await expect
      .poll(() => ctx.page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
        timeout: 15_000,
      })
      .toBe('newsprint')
  })
})
