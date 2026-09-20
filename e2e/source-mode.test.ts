// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * Source Code Mode: the raw markdown in CodeMirror.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const ORIGINAL = '# Heading\n\nSome **bold** text.\n\n- one\n- two\n'

async function openSample(name = 'source.md'): Promise<string> {
  const file = join(ctx.workdir, name)
  await writeFile(file, ORIGINAL, 'utf8')
  await openFile(ctx, file)
  await waitForText(ctx, 'Heading')
  return file
}

async function toggleSourceMode(): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.locator('.ProseMirror, .cm-content').first().click()
  await ctx.page.keyboard.press('Control+/')
}

describe('source mode', () => {
  it('shows the raw markdown, not the rendered document', async () => {
    await openSample()
    await toggleSourceMode()
    await ctx.page.waitForSelector('.cm-content', { state: 'visible', timeout: 15_000 })

    const text = await ctx.page.locator('.cm-content').innerText()
    // The markup itself is visible here, which is the whole point.
    expect(text).toContain('# Heading')
    expect(text).toContain('**bold**')
    expect(text).toContain('- one')
  })

  it('replaces the rich editor rather than showing both', async () => {
    expect(await ctx.page.locator('.ProseMirror').count()).toBe(0)
  })

  it('shows line numbers', async () => {
    expect(await ctx.page.locator('.cm-gutters').count()).toBeGreaterThan(0)
  })

  it('edits made as source survive returning to the rich view', async () => {
    await ctx.page.locator('.cm-content').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type('\n\nAdded while in source mode.\n')
    await ctx.page.waitForTimeout(400)

    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 15_000 })

    // The rich editor must be rebuilt from the edited text, not show the stale
    // version it was holding before the switch.
    await waitForText(ctx, 'Added while in source mode')
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('Heading')
  })

  it('saves what the source view showed, byte for byte', async () => {
    const file = await openSample('roundtrip.md')
    await toggleSourceMode()
    await ctx.page.waitForSelector('.cm-content', { state: 'visible', timeout: 15_000 })

    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1200)

    // Untouched in source mode, so the file must be unchanged.
    expect(await readFile(file, 'utf8')).toBe(ORIGINAL)
  })

  it('is per document, so another tab stays rich', async () => {
    // The previous test left roundtrip.md in source mode. Open a second file
    // and confirm it comes up in the rich view.
    const other = join(ctx.workdir, 'other.md')
    await writeFile(other, '# Separate document\n', 'utf8')
    await openFile(ctx, other)
    await waitForText(ctx, 'Separate document')

    expect(await ctx.page.locator('.ProseMirror').count()).toBe(1)
    expect(await ctx.page.locator('.cm-content').count()).toBe(0)
  })

  it('is reported as checked in the View menu', async () => {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.menubar__top', { hasText: /^View$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })

    const item = ctx.page.locator('.menu__item', { hasText: 'Source Code Mode' }).first()
    // The active document is the rich one, so the toggle reads unchecked.
    expect(await item.getAttribute('aria-checked')).toBe('false')
    await ctx.page.keyboard.press('Escape')
  })
})
