// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chooseMenu, openFile, openMenu, useApp, waitForText } from './helpers'

/**
 * The status bar: where the caret is, what is selected, and the modes in force.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const status = () => ctx.page.locator('.status')
const badge = (label: string) => ctx.page.locator('.status .badge', { hasText: label })

async function openSample(): Promise<void> {
  const file = join(ctx.workdir, 'status.md')
  await writeFile(file, '# Notes\n\nAlpha beta.\n\nGamma delta epsilon.\n', 'utf8')
  await openFile(ctx, file)
  await waitForText(ctx, 'Gamma delta epsilon.')
}

describe('the status bar', () => {
  it('counts the words selected, of all of them', async () => {
    await openSample()
    await ctx.page.locator('.ProseMirror p', { hasText: 'Gamma' }).click()
    await chooseMenu(ctx, 'Edit', 'Selection', 'Select Line')
    // The heading's # is not a word.
    await expect.poll(() => status().locator('.words').innerText()).toBe('3 of 6 words')

    // Collapsed with a click, which the editor handles itself. ArrowRight is
    // the browser's, and on a CI runner the editor once never took up the
    // selection it made (see CLAUDE.md on keyboard selections in e2e).
    await ctx.page.locator('.ProseMirror h1').click()
    await expect.poll(() => status().locator('.words').innerText()).toBe('6 words')
  })

  it('shows the line and column in the source view', async () => {
    await openSample()
    await ctx.page.keyboard.press('Control+/')
    await ctx.page.locator('.cm-content').click()
    await ctx.page.keyboard.press('Control+Home')
    await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.keyboard.press('End')
    await expect.poll(() => status().locator('.position').innerText()).toBe('Ln 3, Col 12')

    // Nothing to count lines by in the formatted view.
    await badge('Source').click()
    await ctx.page.waitForSelector('.ProseMirror')
    expect(await status().locator('.position').count()).toBe(0)
  })

  it('shows the modes in force, and a click turns one off', async () => {
    await openSample()
    await ctx.page.locator('.ProseMirror p', { hasText: 'Alpha' }).click()
    expect(await ctx.page.locator('.status .badge').count()).toBe(0)

    await ctx.page.keyboard.press('F8')
    await expect.poll(() => badge('Focus').count()).toBe(1)
    await badge('Focus').click()
    await expect.poll(() => badge('Focus').count()).toBe(0)
    // Off, not only unbadged: the menu says so too.
    await openMenu(ctx, 'View')
    await expect
      .poll(() =>
        ctx.page
          .locator('.menu [role="menuitemcheckbox"]', { hasText: 'Focus Mode' })
          .getAttribute('aria-checked')
      )
      .toBe('false')
    await ctx.page.keyboard.press('Escape')
  })
})
