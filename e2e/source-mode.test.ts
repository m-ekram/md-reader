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

describe('commands in a document shown as source', () => {
  it('never reach another tab’s hidden editor', async () => {
    // Commands found "the editor" as the one most recently on screen. A
    // document shown as source has none of its own, so Ctrl+B there made the
    // text selected in another tab bold, out of sight.
    const rich = join(ctx.workdir, 'rich.md')
    await writeFile(rich, 'Leave this text plain.\n', 'utf8')
    await openFile(ctx, rich)
    await waitForText(ctx, 'Leave this text plain.')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+a')

    // Past the line count at which a document opens as source: no rich editor
    // is ever built for it.
    await ctx.page.evaluate(async () => {
      const s = await window.api.settings.get()
      await window.api.settings.patch({ editor: { ...s.editor, sourceModeForceLines: 3 } })
    })
    const long = join(ctx.workdir, 'long.md')
    await writeFile(long, 'one\n\ntwo\n\nthree\n\nfour\n', 'utf8')
    await openFile(ctx, long)
    await ctx.page.waitForSelector('.cm-content', { state: 'visible', timeout: 15_000 })
    await ctx.page.locator('.cm-content').click()
    await ctx.page.keyboard.press('Control+a')
    await ctx.page.keyboard.press('Control+b')

    // The Edit menu's own actions go to whatever has focus, the source view
    // included, so they stay available there.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.menubar__top', { hasText: /^Edit$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    for (const label of ['Undo', 'Copy', 'Paste']) {
      const item = ctx.page.locator('.menu__item', { hasText: new RegExp(`^${label}`) }).first()
      expect(await item.getAttribute('aria-disabled'), `${label} is greyed out`).not.toBe('true')
    }
    await ctx.page.keyboard.press('Escape')

    await ctx.page.locator('.tab__select', { hasText: 'rich.md' }).click()
    await waitForText(ctx, 'Leave this text plain.')
    expect(await ctx.page.locator('.ProseMirror strong').count()).toBe(0)
    expect(
      await ctx.page.locator('.tab__select', { hasText: 'rich.md' }).locator('.tab__dot').count()
    ).toBe(0)
  })
})

describe('the outline in source view', () => {
  it('scrolls to the heading clicked', async () => {
    // It looked for the heading in the formatted view, which is not on screen
    // in source view, so a click did nothing.
    const body = Array.from({ length: 300 }, (_, i) => `Filler line ${i + 1}.`).join('\n\n')
    const file = join(ctx.workdir, 'outline-source.md')
    await writeFile(file, `# Top\n\n${body}\n\n## Far Down\n\nThe end.\n`, 'utf8')
    // Opened in source view by the threshold, whatever an earlier test left it at.
    await ctx.page.evaluate(() =>
      window.api.settings.patch({
        editor: { sourceModeForceLines: 3 },
        sidebar: { visible: true, panel: 'outline' },
      })
    )
    await openFile(ctx, file)
    await ctx.page
      .locator('.cm-content', { hasText: '# Top' })
      .waitFor({ state: 'visible', timeout: 15_000 })

    await ctx.page.locator('.outline__item', { hasText: 'Far Down' }).click()

    await expect
      .poll(() =>
        ctx.page.evaluate(() => {
          const line = [...document.querySelectorAll('.cm-line')].find((l) =>
            l.textContent?.includes('## Far Down')
          )
          // The pane scrolls, not CodeMirror's own scroller, which is as tall
          // as the document.
          const scroller = document.querySelector('.editor-scroll')
          if (!line || !scroller) return false
          const a = line.getBoundingClientRect()
          const b = scroller.getBoundingClientRect()
          return a.top >= b.top && a.bottom <= b.bottom
        })
      )
      .toBe(true)
  })
})

describe('the outline marks where the caret is', () => {
  const current = () => ctx.page.locator('.outline__item[aria-current="location"]').allInnerTexts()

  it('in source view, the heading above the caret', async () => {
    // Still the document above, in source view: the click put the caret on
    // Far Down's line.
    await expect.poll(current).toEqual(['Far Down'])
    await ctx.page.keyboard.press('Control+Home')
    await expect.poll(current).toEqual(['Top'])
  })

  it('in the formatted view, the heading above the caret', async () => {
    const file = join(ctx.workdir, 'outline-caret.md')
    await writeFile(file, '# One\n\nFirst part.\n\n## Two\n\nSecond part.\n\n## Three\n\nEnd.\n')
    await ctx.page.evaluate(() =>
      window.api.settings.patch({ editor: { sourceModeForceLines: 10_000 } })
    )
    await openFile(ctx, file)
    await waitForText(ctx, 'Second part.')

    await ctx.page.locator('.ProseMirror p', { hasText: 'Second part.' }).click()
    await expect.poll(current).toEqual(['Two'])
    await ctx.page.locator('.ProseMirror p', { hasText: 'End.' }).click()
    await expect.poll(current).toEqual(['Three'])
  })
})
