// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newDocument, openFile, useApp, waitForText } from './helpers'

/**
 * Preferences, asserted on what the setting does rather than on it being
 * stored. Several of these have a runtime counterpart that is read per
 * keystroke, so a dialog that only wrote to the settings file would leave the
 * preference and the behaviour disagreeing until the next launch — which is
 * the failure this suite exists to catch.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const dialog = () => ctx.page.locator('.prefs__panel')

async function openPreferences(): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.keyboard.press('Control+,')
  await ctx.page.waitForSelector('.prefs__panel', { state: 'visible', timeout: 10_000 })
}

/** The checkbox in the row whose label reads `label`. */
function toggle(label: string) {
  return ctx.page.locator('.prefs__panel .row--check').filter({ hasText: label }).locator('input')
}

describe('preferences dialog', () => {
  it('opens on Ctrl+, and closes on Escape', async () => {
    const file = join(ctx.workdir, 'prefs.md')
    await writeFile(file, '# Prefs\n\nSome text.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Prefs')

    await openPreferences()
    expect(await dialog().count()).toBe(1)

    await ctx.page.keyboard.press('Escape')
    await expect.poll(() => dialog().count(), { timeout: 5000 }).toBe(0)
  })

  it('reflects state set from elsewhere in the application', async () => {
    // The status bar is on by default and is toggled from the View menu too,
    // so the dialog must be a view over the settings rather than its own copy.
    await openPreferences()
    expect(await toggle('Show status bar').isChecked()).toBe(true)
    await ctx.page.keyboard.press('Escape')
  })

  it('applies a change immediately, with no OK button', async () => {
    await openPreferences()
    await toggle('Show status bar').uncheck()
    await ctx.page.keyboard.press('Escape')

    await expect.poll(() => ctx.page.locator('.status').count(), { timeout: 5000 }).toBe(0)

    // Put it back, and confirm the dialog drove it both ways.
    await openPreferences()
    await toggle('Show status bar').check()
    await ctx.page.keyboard.press('Escape')
    await expect.poll(() => ctx.page.locator('.status').count(), { timeout: 5000 }).toBe(1)
  })

  it('changes the theme from the dialog as well as the menu', async () => {
    await openPreferences()
    await ctx.page.locator('.prefs__panel select').selectOption('night')
    await expect
      .poll(() => ctx.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('night')

    await ctx.page.locator('.prefs__panel select').selectOption('github')
    await expect
      .poll(() => ctx.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('github')
    await ctx.page.keyboard.press('Escape')
  })

  it('makes whitespace markers appear straight away', async () => {
    // The runtime counterpart case: storing alone would leave the setting on
    // and the markers absent until the next launch.
    await openPreferences()
    await toggle('Show whitespace').check()
    await ctx.page.keyboard.press('Escape')

    await expect
      .poll(() => ctx.page.locator('.ProseMirror .ws-space').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)

    await openPreferences()
    await toggle('Show whitespace').uncheck()
    await ctx.page.keyboard.press('Escape')
    await expect
      .poll(() => ctx.page.locator('.ProseMirror .ws-space').count(), { timeout: 10_000 })
      .toBe(0)
  })

  it('stops curling quotes as soon as the box is cleared', async () => {
    await openPreferences()
    await toggle('Curly quotes').uncheck()
    await ctx.page.keyboard.press('Escape')

    await newDocument(ctx)
    await ctx.page.keyboard.type('"straight"')
    await waitForText(ctx, 'straight')

    const typed = await ctx.page.locator('.ProseMirror').innerText()
    expect(typed).toContain('"straight"')
    expect(typed).not.toContain('“')
  })

  it('refuses an assets folder that would write outside the document folder', async () => {
    await openPreferences()
    const field = ctx.page.locator('.prefs__panel input[type="text"]').first()
    const before = await field.inputValue()

    await field.fill('../elsewhere')
    await field.blur()
    // The rejection shows at once, in the field itself: typed text left in
    // place would display a setting that is in force nowhere.
    await expect.poll(() => field.inputValue()).toBe(before)

    // Rejected rather than stored: pasted images must land beside the
    // document, and an escaping path is the one thing this setting must not do.
    await ctx.page.keyboard.press('Escape')
    await openPreferences()
    expect(await ctx.page.locator('.prefs__panel input[type="text"]').first().inputValue()).toBe(
      before
    )
    await ctx.page.keyboard.press('Escape')
  })

  it('keeps the source-mode thresholds in a sane order', async () => {
    await openPreferences()
    const numbers = ctx.page.locator('.prefs__panel input[type="number"]')

    // Forcing source mode below the line where it is merely offered would mean
    // never offering it at all.
    await numbers.nth(0).fill('20000')
    await numbers.nth(0).blur()

    // The force threshold is pulled up to meet the new offer threshold.
    await expect
      .poll(async () => Number(await numbers.nth(1).inputValue()))
      .toBeGreaterThanOrEqual(20000)
    await ctx.page.keyboard.press('Escape')
  })
})
