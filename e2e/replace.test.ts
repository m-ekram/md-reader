// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { noticeTexts, openFile, useApp, waitForText } from './helpers'

/**
 * Replace across the folder, from the Search panel: previewed, then written,
 * leaving out what the preview says to.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

describe('replace across the folder', () => {
  it('shows what would change, then changes only what is chosen', async () => {
    // Replacing in many files meant opening each one.
    const dir = join(ctx.workdir, 'many')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'a.md'), 'A cat and a cat.\n', 'utf8')
    await writeFile(join(dir, 'b.md'), 'One cat.\r\nWindows lines.\r\n', 'utf8')
    await writeFile(join(dir, 'c.md'), 'A cat in a tab.\n', 'utf8')
    await writeFile(join(dir, 'skip.md'), 'This cat stays.\n', 'utf8')

    await ctx.page.evaluate((root) => window.api.workspace.set(root), dir)
    await ctx.page.evaluate(() =>
      window.api.settings.patch({ sidebar: { visible: true, panel: 'search' } })
    )
    await openFile(ctx, join(dir, 'c.md'))
    await waitForText(ctx, 'A cat in a tab.')

    await ctx.page.locator('.search__input').fill('cat')
    await expect.poll(() => ctx.page.locator('.results__hit').count(), { timeout: 15_000 }).toBe(4)
    await ctx.page.getByRole('textbox', { name: 'Replace in folder with' }).fill('dog')
    await ctx.page.getByRole('button', { name: 'Replace…' }).click()

    const dialog = ctx.page.getByRole('dialog', { name: 'Replace in folder' })
    await expect.poll(() => dialog.locator('.replace__file').count(), { timeout: 15_000 }).toBe(4)
    // The open one is said to change in its tab.
    expect(await dialog.locator('.replace__file', { hasText: 'c.md' }).innerText()).toContain(
      'open, stays unsaved'
    )
    await dialog.locator('.replace__file', { hasText: 'skip.md' }).locator('input').uncheck()
    await dialog.getByRole('button', { name: /^Replace 4 in 3 files$/ }).click()

    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '), { timeout: 15_000 })
      .toContain('Replaced 4 matches in 3 files.')
    expect(await readFile(join(dir, 'a.md'), 'utf8')).toBe('A dog and a dog.\n')
    // Windows line endings kept.
    expect(await readFile(join(dir, 'b.md'), 'utf8')).toBe('One dog.\r\nWindows lines.\r\n')
    // Left out in the preview, so left alone.
    expect(await readFile(join(dir, 'skip.md'), 'utf8')).toBe('This cat stays.\n')
    // The open one changed in its tab, unsaved; the file on disk is as it was.
    await waitForText(ctx, 'A dog in a tab.')
    expect(await readFile(join(dir, 'c.md'), 'utf8')).toBe('A cat in a tab.\n')
    await expect.poll(() => ctx.page.title()).toMatch(/^•/)
  })
})
