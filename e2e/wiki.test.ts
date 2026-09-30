// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { noticeTexts, openFile, useApp, waitForText } from './helpers'

/**
 * `[[Wiki links]]`: shown as links, followed with Ctrl+click, and suggested
 * as they are typed.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const notes = () => join(ctx.workdir, 'notes')

/** Day 2 is far enough down that reaching it means scrolling. */
const PORTO = [
  '# Porto',
  '## Day 1',
  ...Array.from({ length: 60 }, (_, i) => `Walked along street ${i + 1}.`),
  '## Day 2',
  'The river.',
].join('\n\n')

/** Writes the notes folder, opens it, and shows `file` from it. */
async function openNote(file: string, text: string): Promise<void> {
  await mkdir(join(notes(), 'trips'), { recursive: true })
  await writeFile(
    join(notes(), 'index.md'),
    '# Index\n\nSee [[Lisbon]] and [[trips/Porto#Day 2|the second day]].\n',
    'utf8'
  )
  await writeFile(join(notes(), 'Lisbon.md'), '# Lisbon\n\nTiles.\n', 'utf8')
  await writeFile(join(notes(), 'trips', 'Porto.md'), `${PORTO}\n`, 'utf8')
  await writeFile(join(notes(), 'plans.md'), '# Plans\n\nThen [[Madrid]].\n', 'utf8')
  const root = notes()
  await ctx.page.evaluate(async (r) => {
    await window.api.workspace.set(r)
  }, root)
  await openFile(ctx, join(root, file))
  await waitForText(ctx, text)
}

const link = (text: string) => ctx.page.locator('.ProseMirror .wiki-link', { hasText: text })

describe('wiki links', () => {
  it('are shown as links, in the link colour', async () => {
    // They were plain text, looking like any other brackets.
    await openNote('index.md', 'See [[Lisbon]]')

    const links = ctx.page.locator('.ProseMirror .wiki-link')
    await expect
      .poll(() => links.allInnerTexts())
      .toEqual(['[[Lisbon]]', '[[trips/Porto#Day 2|the second day]]'])
    const [linkColour, text] = await Promise.all([
      links.first().evaluate((el) => getComputedStyle(el).color),
      ctx.page
        .locator('.ProseMirror p')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ])
    expect(linkColour).not.toBe(text)
  })

  it('open the note they name on Ctrl+click', async () => {
    await openNote('index.md', 'See [[Lisbon]]')
    await link('[[Lisbon]]').click({ modifiers: ['Control'] })
    await waitForText(ctx, 'Tiles.')
  })

  it('open at the heading after #', async () => {
    await openNote('index.md', 'See [[Lisbon]]')
    await link('the second day').click({ modifiers: ['Control'] })
    await waitForText(ctx, 'The river.')

    // Day 2 is on screen, and not only in the document.
    const inView = () =>
      ctx.page.evaluate(() => {
        const scroller = document.querySelector('.editor-scroll')!.getBoundingClientRect()
        const heading = [...document.querySelectorAll('.ProseMirror h2')].find(
          (h) => h.textContent === 'Day 2'
        )
        if (!heading) return false
        const r = heading.getBoundingClientRect()
        return r.top >= scroller.top && r.bottom <= scroller.bottom
      })
    await expect.poll(inView).toBe(true)
  })

  it('offer to make a note that is not there', async () => {
    await openNote('plans.md', 'Then [[Madrid]]')
    await link('[[Madrid]]').click({ modifiers: ['Control'] })

    await expect.poll(() => noticeTexts(ctx)).toContainEqual('No note is named “Madrid”.')
    await ctx.page
      .locator('.note', { hasText: 'No note is named' })
      .getByRole('button', { name: 'Create Madrid.md' })
      .click()

    // Beside the note the link is in, and opened.
    await expect
      .poll(() =>
        stat(join(notes(), 'Madrid.md')).then(
          () => true,
          () => false
        )
      )
      .toBe(true)
    await expect
      .poll(() => ctx.page.locator('.tab__select[aria-selected="true"]').innerText())
      .toContain('Madrid')
  })
})
