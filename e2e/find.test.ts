// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newDocument, openFile, useApp, waitForText } from './helpers'

/**
 * Find and replace inside the open document, as opposed to the folder-wide
 * Search panel.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

async function documentWith(body: string, name = 'find.md'): Promise<string> {
  const file = join(ctx.workdir, name)
  await writeFile(file, body, 'utf8')
  await openFile(ctx, file)
  return file
}

describe('find', () => {
  it('opens with Ctrl+F and reports how many matches there are', async () => {
    await documentWith('# Find me\n\nneedle one\n\nnot here\n\nneedle two\n')
    await waitForText(ctx, 'needle one')

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+f')
    await ctx.page.waitForSelector('.find__input', { state: 'visible', timeout: 10_000 })

    await ctx.page.locator('.find__input').first().fill('needle')
    await ctx.page.waitForFunction(
      () => (document.querySelector('.find__count')?.textContent ?? '').includes('of 2'),
      { timeout: 10_000 }
    )

    expect(await ctx.page.locator('.find__count').first().innerText()).toContain('2')
  })

  it('highlights the matches in the document', async () => {
    // The count could be right while nothing is visibly marked, which is the
    // failure mode worth guarding: the user looks at the text, not the counter.
    // By colour, not by class: the class was there all along, with no style
    // behind it, so nothing on screen was marked.
    const background = await ctx.page.evaluate(() => {
      const match = document.querySelector('.ProseMirror .ProseMirror-search-match')
      return match ? getComputedStyle(match).backgroundColor : null
    })
    expect(background, 'no match is marked').not.toBeNull()
    expect(background, 'the match is marked with no colour').not.toBe('rgba(0, 0, 0, 0)')
  })

  it('says so when nothing matches', async () => {
    await ctx.page.locator('.find__input').first().fill('absolutely-not-present')
    await ctx.page.waitForFunction(
      () => (document.querySelector('.find__count')?.textContent ?? '').includes('No results'),
      { timeout: 10_000 }
    )
    expect(await ctx.page.locator('.find__count').first().innerText()).toContain('No results')
  })

  it('closes on Escape and clears the highlights', async () => {
    await ctx.page.locator('.find__input').first().fill('needle')
    // Highlights must exist before their clearing means anything: without
    // this the test passed whether or not Escape cleared a thing.
    await expect
      .poll(() => ctx.page.locator('.ProseMirror .ProseMirror-search-match').count())
      .toBeGreaterThan(0)
    await ctx.page.keyboard.press('Escape')

    await ctx.page.waitForFunction(() => !document.querySelector('.find__input'), {
      timeout: 10_000,
    })
    expect(await ctx.page.locator('.ProseMirror .ProseMirror-search-match').count()).toBe(0)
  })
})

describe('replace', () => {
  it('replaces every occurrence and leaves the rest of the document alone', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('alpha beta alpha gamma alpha')
    await waitForText(ctx, 'gamma alpha')

    await ctx.page.keyboard.press('Control+h')
    await ctx.page.waitForSelector('.find__input', { state: 'visible', timeout: 10_000 })

    const inputs = ctx.page.locator('.find__input')
    await inputs.nth(0).fill('alpha')
    await ctx.page.waitForFunction(
      (n) => (document.querySelector('.find__count')?.textContent ?? '').includes(n),
      '3',
      { timeout: 10_000 }
    )
    await inputs.nth(1).fill('OMEGA')

    await ctx.page.locator('.find__wide', { hasText: 'All' }).click()
    await ctx.page.waitForFunction(
      () => (document.querySelector('.ProseMirror')?.textContent ?? '').includes('OMEGA'),
      { timeout: 10_000 }
    )

    const text = await ctx.page.locator('.ProseMirror').innerText()
    expect(text).not.toContain('alpha')
    expect(text).toContain('OMEGA')
    // The words that were never matched must survive untouched.
    expect(text).toContain('beta')
    expect(text).toContain('gamma')
  })

  it('replaces one occurrence at a time', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('keep one keep two keep three')
    await waitForText(ctx, 'keep three')

    await ctx.page.keyboard.press('Control+h')
    await ctx.page.waitForSelector('.find__input', { state: 'visible', timeout: 10_000 })

    const inputs = ctx.page.locator('.find__input')
    await inputs.nth(0).fill('keep')
    await ctx.page.waitForFunction(
      (n) => (document.querySelector('.find__count')?.textContent ?? '').includes(n),
      '3',
      { timeout: 10_000 }
    )
    await inputs.nth(1).fill('DONE')

    await ctx.page.locator('.find__wide', { hasText: 'Replace' }).first().click()
    await ctx.page.waitForFunction(
      () => (document.querySelector('.ProseMirror')?.textContent ?? '').includes('DONE'),
      { timeout: 10_000 }
    )

    const text = await ctx.page.locator('.ProseMirror').innerText()
    // Exactly one replaced; the other two are still waiting.
    expect(text.match(/DONE/g) ?? []).toHaveLength(1)
    expect(text.match(/keep/g) ?? []).toHaveLength(2)
  })
})

describe('match case', () => {
  it('distinguishes case when asked to', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('Apple apple APPLE')
    await waitForText(ctx, 'APPLE')

    await ctx.page.keyboard.press('Control+f')
    await ctx.page.waitForSelector('.find__input', { state: 'visible', timeout: 10_000 })
    await ctx.page.locator('.find__input').first().fill('apple')

    // Case-insensitive by default: all three.
    await ctx.page.waitForFunction(
      () => (document.querySelector('.find__count')?.textContent ?? '').includes('3'),
      { timeout: 10_000 }
    )

    await ctx.page.locator('.find__opt', { hasText: 'Aa' }).click()
    await ctx.page.waitForFunction(
      () => (document.querySelector('.find__count')?.textContent ?? '').includes('1'),
      { timeout: 10_000 }
    )
    expect(await ctx.page.locator('.find__count').first().innerText()).toContain('1')
  })
})
