// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useApp } from './helpers'

/**
 * The application shell: window chrome, status bar, and a usable document on launch.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('application shell', () => {
  it('starts without console errors', () => {
    expect(ctx.consoleErrors).toEqual([])
  })

  it('renders the title bar and status bar', async () => {
    await expect(ctx.page.locator('.titlebar')).toBeTruthy()
    expect(await ctx.page.locator('.titlebar').count()).toBe(1)
    expect(await ctx.page.locator('.status').count()).toBe(1)
  })

  it('starts with an editable document', async () => {
    expect(await ctx.page.locator('.ProseMirror').count()).toBe(1)
  })
})

describe('the command palette runs what it lists', () => {
  /**
   * Asserted by what the command did to the document, not by the palette
   * closing: a palette that opens, filters and dismisses without running
   * anything would pass every check made on the palette alone.
   */
  async function openPalette(): Promise<void> {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+Shift+P')
    await ctx.page.waitForSelector('.palette__panel', { state: 'visible' })
  }

  it('opens on Ctrl+Shift+P and filters as you type', async () => {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)

    await openPalette()
    const all = await ctx.page.locator('.palette__item').count()
    expect(all).toBeGreaterThan(10)

    await ctx.page.keyboard.type('quote')
    await ctx.page.waitForTimeout(300)
    const filtered = await ctx.page.locator('.palette__item').count()
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(all)
    await ctx.page.keyboard.press('Escape')
    await expect
      .poll(() => ctx.page.locator('.palette__panel').count())
      .toBe(0)
  })

  it('shows where a command lives, so two "Image" items are distinguishable', async () => {
    await openPalette()
    await ctx.page.keyboard.type('heading 2')
    await ctx.page.waitForTimeout(300)
    const path = await ctx.page.locator('.palette__item').first().locator('.palette__path').innerText()
    expect(path).toContain('Paragraph')
    await ctx.page.keyboard.press('Escape')
  })

  it('runs the selected command against the document', async () => {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    // Clicking leaves the pointer in the middle of the editor, which is where
    // the palette opens. That is not incidental: it is how this test caught a
    // real bug, where a row appearing under the resting cursor claimed the
    // selection and Enter ran a command the user had never looked at.
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('palette target')
    await ctx.page.waitForTimeout(250)
    await ctx.page.keyboard.press('Control+a')

    await openPalette()
    await ctx.page.keyboard.type('quote')
    await ctx.page.waitForTimeout(300)

    // Asserted before Enter, so a selection that has drifted fails here and
    // names the cause, rather than failing later as a missing blockquote.
    const first = ctx.page.locator('.palette__item').first()
    expect(await first.locator('.palette__label').innerText()).toBe('Quote')
    expect(await first.getAttribute('aria-selected'), 'the top row keeps the selection').toBe(
      'true'
    )

    await ctx.page.keyboard.press('Enter')
    await ctx.page.waitForTimeout(600)

    expect(await ctx.page.locator('.ProseMirror blockquote').count()).toBeGreaterThan(0)
  })

  it('leaves unavailable commands unrunnable rather than hiding the failure', async () => {
    // Table commands are disabled outside a table. The palette must not run one
    // on Enter, or it becomes a way around every enabled() guard in the app.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('not a table')
    await ctx.page.waitForTimeout(250)

    await openPalette()
    await ctx.page.keyboard.type('add row above')
    await ctx.page.waitForTimeout(300)

    const row = ctx.page.locator('.palette__item', { hasText: 'Add Row Above' }).first()
    expect(await row.getAttribute('aria-disabled')).toBe('true')

    // Forced, because Playwright refuses to click something reporting
    // aria-disabled. That refusal is the affordance working; the force is what
    // gets past it to test the handler's own guard underneath.
    await row.click({ force: true })
    await ctx.page.waitForTimeout(400)
    // Still open, because choosing a disabled command does nothing at all.
    expect(await ctx.page.locator('.palette__panel').count()).toBe(1)
    await ctx.page.keyboard.press('Escape')
  })
})
