// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { newDocument, nextFrames, useApp, waitForText } from './helpers'

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

  const items = () => ctx.page.locator('.palette__item')
  const firstLabel = () => items().first().locator('.palette__label').innerText()

  it('opens on Ctrl+Shift+P and filters as you type', async () => {
    await newDocument(ctx)

    await openPalette()
    const all = await items().count()
    expect(all).toBeGreaterThan(10)

    await ctx.page.keyboard.type('quote')
    await expect.poll(() => items().count()).toBeLessThan(all)
    expect(await items().count()).toBeGreaterThan(0)

    await ctx.page.keyboard.press('Escape')
    await expect.poll(() => ctx.page.locator('.palette__panel').count()).toBe(0)
  })

  it('shows where a command lives, so two "Image" items are distinguishable', async () => {
    await openPalette()
    await ctx.page.keyboard.type('heading 2')
    await expect.poll(firstLabel).toBe('Heading 2')
    expect(await items().first().locator('.palette__path').innerText()).toContain('Paragraph')
    await ctx.page.keyboard.press('Escape')
  })

  it('runs the selected command against the document', async () => {
    // newDocument clicks into the editor, which leaves the pointer in its
    // middle: where the palette opens. That is not incidental. It is how this
    // test caught a real bug, where a row appearing under the resting cursor
    // claimed the selection and Enter ran a command nobody had looked at.
    await newDocument(ctx)
    await ctx.page.keyboard.type('palette target')
    await waitForText(ctx, 'palette target')
    await ctx.page.keyboard.press('Control+a')

    await openPalette()
    await ctx.page.keyboard.type('quote')
    await expect.poll(firstLabel).toBe('Quote')

    // Asserted before Enter, so a selection that has drifted fails here and
    // names the cause, rather than failing later as a missing blockquote.
    expect(
      await items().first().getAttribute('aria-selected'),
      'the top row keeps the selection'
    ).toBe('true')

    await ctx.page.keyboard.press('Enter')
    await expect.poll(() => ctx.page.locator('.ProseMirror blockquote').count()).toBeGreaterThan(0)
  })

  it('leaves unavailable commands unrunnable rather than hiding the failure', async () => {
    // Table commands are disabled outside a table. The palette must not run one
    // on Enter, or it becomes a way around every enabled() guard in the app.
    await newDocument(ctx)
    await ctx.page.keyboard.type('not a table')
    await waitForText(ctx, 'not a table')

    await openPalette()
    await ctx.page.keyboard.type('add row above')
    const row = items().filter({ hasText: 'Add Row Above' }).first()
    await expect.poll(() => row.getAttribute('aria-disabled')).toBe('true')

    // Forced, because Playwright refuses to click something reporting
    // aria-disabled. That refusal is the affordance working; the force is what
    // gets past it to test the handler's own guard underneath.
    await row.click({ force: true })
    await nextFrames(ctx)
    // Still open, because choosing a disabled command does nothing at all.
    expect(await ctx.page.locator('.palette__panel').count()).toBe(1)
    await ctx.page.keyboard.press('Escape')
  })
})
