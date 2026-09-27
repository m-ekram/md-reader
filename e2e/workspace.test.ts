// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText, watcherReady } from './helpers'

/**
 * The opened folder: sidebar panels, search, watching and renames.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

async function showPanel(panel: 'files' | 'articles' | 'outline' | 'search'): Promise<void> {
  await ctx.page.evaluate(
    (p) => window.api.settings.patch({ sidebar: { visible: true, width: 280, panel: p } }),
    panel
  )
}

const allText = (selector: string) => () => ctx.page.locator(selector).allTextContents()

describe('workspace, sidebar and watching', () => {
  const notes = () => join(ctx.workdir, 'notes')

  async function openWorkspace(): Promise<void> {
    await mkdir(join(notes(), 'sub'), { recursive: true })
    await writeFile(join(notes(), 'first.md'), '# First note\n\nsearchable haystack here\n', 'utf8')
    await writeFile(join(notes(), 'second.md'), '# Second note\n\n## Nested heading\n', 'utf8')
    await writeFile(join(notes(), 'sub', 'third.md'), '# Third note\n', 'utf8')
    await writeFile(join(notes(), 'ignored.txt'), 'not markdown\n', 'utf8')

    // Set through main, exactly as Open Folder would; settings broadcast back.
    await ctx.page.evaluate((root) => window.api.workspace.set(root), notes())
    await expect.poll(() => ctx.page.evaluate(() => window.api.workspace.current())).toBe(notes())
  }

  it('lists the folder in the file tree, markdown only', async () => {
    await openWorkspace()
    await showPanel('files')

    await expect
      .poll(allText('.tree__name'))
      .toEqual(expect.arrayContaining(['first.md', 'second.md', 'sub']))
    // A .txt file is not a markdown file and must not be listed.
    expect(await allText('.tree__name')()).not.toContain('ignored.txt')
  })

  it('expands a folder lazily and opens a nested file', async () => {
    await ctx.page.locator('.tree__item', { hasText: 'sub' }).first().click()
    await expect.poll(allText('.tree__name')).toContain('third.md')

    await ctx.page.locator('.tree__item', { hasText: 'third.md' }).first().click()
    await waitForText(ctx, 'Third note')
  })

  it('lists every markdown file in Articles, flat', async () => {
    await showPanel('articles')
    // Flat: the nested file appears alongside the top-level ones.
    await expect
      .poll(allText('.articles__name'))
      .toEqual(expect.arrayContaining(['first.md', 'second.md', 'third.md']))
  })

  it('shows headings of the active document in the Outline', async () => {
    await ctx.page.locator('.articles__item', { hasText: 'second.md' }).first().click()
    await waitForText(ctx, 'Second note')
    await showPanel('outline')

    await expect
      .poll(async () => (await allText('.outline__item')()).map((h) => h.trim()))
      .toEqual(['Second note', 'Nested heading'])
  })

  it('searches the folder and streams results', async () => {
    await showPanel('search')
    await ctx.page.waitForSelector('.search__input', { state: 'visible' })
    await ctx.page.locator('.search__input').fill('searchable haystack')
    await ctx.page.waitForSelector('.results__hit', { timeout: 15_000 })

    const previews = await allText('.results__preview')()
    expect(previews.join(' ')).toContain('searchable haystack')
    expect(await ctx.page.locator('.results__name').first().innerText()).toContain('first.md')
  })

  it('reloads a clean document when the file changes on disk', async () => {
    await showPanel('articles')
    await ctx.page.locator('.articles__item', { hasText: 'first.md' }).first().click()
    await waitForText(ctx, 'First note')

    await writeFile(join(notes(), 'first.md'), '# Rewritten externally\n\nnew body\n', 'utf8')
    // Clean document: no prompt, it should just follow the file.
    await waitForText(ctx, 'Rewritten externally')
  })

  it('keeps the tab and its content when the file is deleted, and says so', async () => {
    const before = await ctx.page.locator('.ProseMirror').innerText()
    await rm(join(notes(), 'first.md'), { force: true })

    // A positive signal that the deletion was seen, rather than a pause long
    // enough to hope it was: the status bar tells the user the file is gone.
    await ctx.page.waitForSelector('.status .detached', { timeout: 15_000 })

    // The tab must survive: a sync client removing a file must not discard work.
    expect(await ctx.page.locator('.ProseMirror').innerText()).toBe(before)
  })
})

describe('Open Quickly', () => {
  it('ranks an exact filename match first and opens it', async () => {
    // The workspace from the previous block is still open.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+p')
    await ctx.page.waitForSelector('.quick__panel', { state: 'visible', timeout: 10_000 })

    await ctx.page.locator('.quick__input').fill('second')
    await expect.poll(async () => (await allText('.quick__name')())[0]).toBe('second.md')

    await ctx.page.keyboard.press('Enter')
    await waitForText(ctx, 'Second note')
  })

  it('matches a subsequence, not just a prefix', async () => {
    await ctx.page.keyboard.press('Control+p')
    await ctx.page.waitForSelector('.quick__panel', { state: 'visible' })
    // "trd" is a subsequence of "third.md" but not a prefix of anything.
    await ctx.page.locator('.quick__input').fill('trd')
    await expect.poll(allText('.quick__name')).toContain('third.md')

    await ctx.page.keyboard.press('Escape')
    await expect.poll(() => ctx.page.locator('.quick__panel').count()).toBe(0)
  })
})

describe('a renamed file keeps its tab', () => {
  it('follows the rename and relabels the tab', async () => {
    const dir = join(ctx.workdir, 'renames')
    await mkdir(dir, { recursive: true })
    const before = join(dir, 'before.md')
    const after = join(dir, 'after.md')
    await writeFile(before, '# Renamed document\n\nbody text\n', 'utf8')

    await ctx.page.evaluate((root) => window.api.workspace.set(root), dir)
    await openFile(ctx, before)
    await waitForText(ctx, 'Renamed document')
    expect(await ctx.page.title()).toContain('before.md')

    // Rename it the way Explorer would, while the tab is open — once the
    // watcher is running, or the rename is never seen at all.
    await watcherReady(ctx, dir)
    await rename(before, after)

    // The tab should move to the new name rather than detaching.
    await ctx.page.waitForFunction(() => document.title.includes('after.md'), { timeout: 20_000 })
    expect(await ctx.page.title()).not.toContain('before.md')

    // And the content is still there, unsaved-work intact.
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('body text')
  })
})
