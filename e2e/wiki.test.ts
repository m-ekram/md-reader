// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * `[[Wiki links]]`: shown as links, followed with Ctrl+click, and suggested
 * as they are typed.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const notes = () => join(ctx.workdir, 'notes')

describe('wiki links', () => {
  it('are shown as links, in the link colour', async () => {
    // They were plain text, looking like any other brackets.
    await mkdir(join(notes(), 'trips'), { recursive: true })
    await writeFile(
      join(notes(), 'index.md'),
      '# Index\n\nSee [[Lisbon]] and [[trips/Porto#Day 2|the second day]].\n',
      'utf8'
    )
    await writeFile(join(notes(), 'Lisbon.md'), '# Lisbon\n\nTiles.\n', 'utf8')
    await writeFile(
      join(notes(), 'trips', 'Porto.md'),
      '# Porto\n\n## Day 1\n\nArrived.\n\n## Day 2\n\nThe river.\n',
      'utf8'
    )
    await ctx.page.evaluate((root) => window.api.workspace.set(root), notes())
    await openFile(ctx, join(notes(), 'index.md'))
    await waitForText(ctx, 'See [[Lisbon]]')

    const links = ctx.page.locator('.ProseMirror .wiki-link')
    await expect
      .poll(() => links.allInnerTexts())
      .toEqual(['[[Lisbon]]', '[[trips/Porto#Day 2|the second day]]'])
    const [link, text] = await Promise.all([
      links.first().evaluate((el) => getComputedStyle(el).color),
      ctx.page
        .locator('.ProseMirror p')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ])
    expect(link).not.toBe(text)
  })
})
