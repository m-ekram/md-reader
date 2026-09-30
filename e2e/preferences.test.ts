// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
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
    await ctx.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('night')
    await expect
      .poll(() => ctx.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('night')

    await ctx.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('github')
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
    // By label: Appearance has text fields too.
    const assetsField = () =>
      ctx.page.locator('.prefs__panel .row').filter({ hasText: 'Assets folder' }).locator('input')
    const field = assetsField()
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
    expect(await assetsField().inputValue()).toBe(before)
    await ctx.page.keyboard.press('Escape')
  })

  it('sets the text font, the code font and the line height, and gives them back', async () => {
    const file = join(ctx.workdir, 'fonts.md')
    await writeFile(file, '# Fonts\n\nSome `code` here.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Some code here.')
    const computed = (selector: string, prop: 'fontFamily' | 'lineHeight' | 'fontSize') =>
      ctx.page
        .locator(selector)
        .first()
        .evaluate((el, p) => getComputedStyle(el)[p], prop)
    const themeFont = await computed('.ProseMirror p', 'fontFamily')
    const themeLineHeight = await computed('.ProseMirror p', 'lineHeight')
    // The theme's own line height reaches the text: Crepe's 1.5 on every
    // paragraph used to outrank it.
    expect(themeLineHeight).toBe(await computed('.milkdown', 'lineHeight'))

    await openPreferences()
    const input = (label: string) =>
      ctx.page.locator('.prefs__panel .row').filter({ hasText: label }).locator('input')
    await input('Text font').fill('Georgia')
    await input('Text font').press('Enter')
    await input('Code font').fill('Courier New')
    await input('Code font').press('Enter')
    await input('Line height').fill('2')
    await input('Line height').press('Enter')

    await expect.poll(() => computed('.ProseMirror p', 'fontFamily')).toMatch(/^"?Georgia"?,/)
    await expect
      .poll(() => computed('.ProseMirror code', 'fontFamily'))
      .toMatch(/^"?Courier New"?,/)
    const size = parseFloat(await computed('.ProseMirror p', 'fontSize'))
    await expect
      .poll(async () => parseFloat(await computed('.ProseMirror p', 'lineHeight')))
      .toBe(size * 2)

    // A name that would break out of the declaration is refused, and the
    // field shows what is in force.
    await input('Text font').fill('Arial; color: red')
    await input('Text font').press('Enter')
    await expect.poll(() => input('Text font').inputValue()).toBe('Georgia')

    for (const label of ['Text font', 'Code font', 'Line height']) {
      await ctx.page
        .locator('.prefs__panel .row')
        .filter({ hasText: label })
        .getByRole('button', { name: 'Reset' })
        .click()
    }
    await expect.poll(() => computed('.ProseMirror p', 'fontFamily')).toBe(themeFont)
    await expect.poll(() => computed('.ProseMirror p', 'lineHeight')).toBe(themeLineHeight)
    await ctx.page.keyboard.press('Escape')
  })

  it('keeps the source-mode thresholds in a sane order', async () => {
    await openPreferences()
    // Found by label, not position: Appearance has number fields too.
    const field = (label: string) =>
      ctx.page.locator('.prefs__panel .row').filter({ hasText: label }).locator('input')
    const offer = field('Offer source mode above')
    const force = field('Default to source mode above')

    // Forcing source mode below the line where it is merely offered would mean
    // never offering it at all.
    await offer.fill('20000')
    await offer.blur()

    // The force threshold is pulled up to meet the new offer threshold.
    try {
      await expect.poll(async () => Number(await force.inputValue())).toBeGreaterThanOrEqual(20000)
    } catch (err) {
      // An open lead: this failed now and then in full runs only, never alone
      // (see CLAUDE.md). What the fields and the stored settings held says
      // whether the change never fired, fired with a partial value, or was
      // stored and not shown; the second reading, whether it was only late.
      console.log(
        'thresholds after the failure',
        JSON.stringify({
          offer: await offer.inputValue(),
          force: await force.inputValue(),
          stored: (await ctx.page.evaluate(() => window.api.settings.get())).editor,
          focused: await ctx.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)),
        })
      )
      await ctx.page.waitForTimeout(3000)
      console.log('force three seconds later', await force.inputValue())
      throw err
    }
    await ctx.page.keyboard.press('Escape')
  })

  it('checks spelling in the language chosen, and goes back to the system’s', async () => {
    const inForce = () =>
      ctx.app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages())
    const before = await inForce()
    const wanted = await ctx.app.evaluate(({ session }) => {
      const list = session.defaultSession.availableSpellCheckerLanguages
      return list.find((l) => l.startsWith('fr')) ?? list[0]
    })

    await openPreferences()
    const select = ctx.page
      .locator('.prefs__panel .row')
      .filter({ hasText: 'Spelling language' })
      .locator('select')
    await expect.poll(() => select.locator('option').count()).toBeGreaterThan(1)
    await select.selectOption(wanted)
    await expect.poll(inForce).toEqual([wanted])
    // Stored, for the next launch.
    await expect
      .poll(() => ctx.page.evaluate(async () => (await window.api.settings.get()).editor))
      .toMatchObject({ spellcheckLanguage: wanted })

    await select.selectOption('')
    await expect.poll(inForce).toEqual(before)
    await ctx.page.keyboard.press('Escape')
  })

  it('writes new documents with the line endings chosen for them', async () => {
    await openPreferences()
    await ctx.page
      .locator('.prefs__panel .row')
      .filter({ hasText: 'Line endings for new documents' })
      .locator('select')
      .selectOption('lf')
    await ctx.page.keyboard.press('Escape')

    await newDocument(ctx)
    await ctx.page.keyboard.type('First')
    await ctx.page.keyboard.press('Enter')
    await ctx.page.keyboard.type('Second')
    await expect.poll(() => ctx.page.locator('.status').innerText()).toMatch(/(^|\s)LF(\s|$)/)

    const target = join(ctx.workdir, 'new-lf.md')
    await ctx.app.evaluate(async ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await ctx.page.keyboard.press('Control+s')
    await expect.poll(() => readFile(target, 'utf8').catch(() => '')).toBe('First\n\nSecond\n')
  })
})
