// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp } from './helpers'

/**
 * The opened folder: sidebar panels, search, watching and renames.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('workspace, sidebar and watching', () => {
  const notes = () => join(ctx.workdir, 'notes')

  async function openWorkspace(): Promise<void> {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(notes(), 'sub'), { recursive: true })
    await writeFile(join(notes(), 'first.md'), '# First note\n\nsearchable haystack here\n', 'utf8')
    await writeFile(join(notes(), 'second.md'), '# Second note\n\n## Nested heading\n', 'utf8')
    await writeFile(join(notes(), 'sub', 'third.md'), '# Third note\n', 'utf8')
    await writeFile(join(notes(), 'ignored.txt'), 'not markdown\n', 'utf8')

    // Set through main, exactly as Open Folder would; settings broadcast back.
    await ctx.page.evaluate((root) => window.api.workspace.set(root), notes())
    await ctx.page.waitForTimeout(1200)
  }

  it('lists the folder in the file tree, markdown only', async () => {
    await openWorkspace()
    await ctx.page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'files' },
      })
    )
    await ctx.page.waitForSelector('.sidebar', { state: 'visible' })
    await ctx.page.waitForTimeout(400)

    const names = await ctx.page.locator('.tree__name').allTextContents()
    expect(names).toContain('first.md')
    expect(names).toContain('second.md')
    expect(names).toContain('sub')
    // A .txt file is not a markdown file and must not be listed.
    expect(names).not.toContain('ignored.txt')
  })

  it('expands a folder lazily and opens a nested file', async () => {
    await ctx.page.locator('.tree__item', { hasText: 'sub' }).first().click()
    await ctx.page.waitForTimeout(500)
    expect(await ctx.page.locator('.tree__name').allTextContents()).toContain('third.md')

    await ctx.page.locator('.tree__item', { hasText: 'third.md' }).first().click()
    await ctx.page.waitForTimeout(900)
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('Third note')
  })

  it('lists every markdown file in Articles, flat', async () => {
    await ctx.page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'articles' },
      })
    )
    await ctx.page.waitForTimeout(600)
    const names = await ctx.page.locator('.articles__name').allTextContents()
    // Flat: the nested file appears alongside the top-level ones.
    expect(names).toEqual(expect.arrayContaining(['first.md', 'second.md', 'third.md']))
  })

  it('shows headings of the active document in the Outline', async () => {
    await ctx.page.locator('.articles__item', { hasText: 'second.md' }).first().click()
    await ctx.page.waitForTimeout(900)
    await ctx.page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'outline' },
      })
    )
    await ctx.page.waitForTimeout(500)

    const headings = await ctx.page.locator('.outline__item').allTextContents()
    expect(headings.map((h) => h.trim())).toEqual(['Second note', 'Nested heading'])
  })

  it('searches the folder and streams results', async () => {
    await ctx.page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 300, panel: 'search' },
      })
    )
    await ctx.page.waitForSelector('.search__input', { state: 'visible' })
    await ctx.page.locator('.search__input').fill('searchable haystack')
    await ctx.page.waitForSelector('.results__hit', { timeout: 15_000 })

    const previews = await ctx.page.locator('.results__preview').allTextContents()
    expect(previews.join(' ')).toContain('searchable haystack')
    expect(await ctx.page.locator('.results__name').first().innerText()).toContain('first.md')
  })

  it('reloads a clean document when the file changes on disk', async () => {
    await ctx.page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'articles' },
      })
    )
    await ctx.page.waitForTimeout(400)
    await ctx.page.locator('.articles__item', { hasText: 'first.md' }).first().click()
    await ctx.page.waitForTimeout(900)
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('First note')

    await writeFile(join(notes(), 'first.md'), '# Rewritten externally\n\nnew body\n', 'utf8')
    // Clean document: no prompt, it should just follow the file.
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('Rewritten externally') ??
        false,
      { timeout: 15_000 }
    )
  })

  it('keeps the tab and its content when the file is deleted', async () => {
    const { rm } = await import('node:fs/promises')
    const before = await ctx.page.locator('.ProseMirror').innerText()
    await rm(join(notes(), 'first.md'), { force: true })
    await ctx.page.waitForTimeout(2500)

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
    await ctx.page.waitForTimeout(400)

    const names = await ctx.page.locator('.quick__name').allTextContents()
    expect(names.length).toBeGreaterThan(0)
    expect(names[0]).toBe('second.md')

    await ctx.page.keyboard.press('Enter')
    await ctx.page.waitForTimeout(900)
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('Second note')
  })

  it('matches a subsequence, not just a prefix', async () => {
    await ctx.page.keyboard.press('Control+p')
    await ctx.page.waitForSelector('.quick__panel', { state: 'visible' })
    // "trd" is a subsequence of "third.md" but not a prefix of anything.
    await ctx.page.locator('.quick__input').fill('trd')
    await ctx.page.waitForTimeout(400)
    expect(await ctx.page.locator('.quick__name').allTextContents()).toContain('third.md')
    await ctx.page.keyboard.press('Escape')
    await ctx.page.waitForTimeout(200)
    expect(await ctx.page.locator('.quick__panel').count()).toBe(0)
  })
})
describe('a renamed file keeps its tab', () => {
  it('follows the rename and relabels the tab', async () => {
    const { mkdir, rename } = await import('node:fs/promises')
    const dir = join(ctx.workdir, 'renames')
    await mkdir(dir, { recursive: true })
    const before = join(dir, 'before.md')
    const after = join(dir, 'after.md')
    await writeFile(before, '# Renamed document\n\nbody text\n', 'utf8')

    await ctx.page.evaluate((root) => window.api.workspace.set(root), dir)
    await ctx.page.waitForTimeout(800)

    await openFile(ctx, before)
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('Renamed document') ?? false,
      { timeout: 15_000 }
    )
    expect(await ctx.page.evaluate(() => document.title)).toContain('before.md')

    // Rename it the way Explorer would, while the tab is open.
    await rename(before, after)

    // The tab should move to the new name rather than detaching.
    await ctx.page.waitForFunction(() => document.title.includes('after.md'), { timeout: 20_000 })

    const title = await ctx.page.evaluate(() => document.title)
    expect(title).toContain('after.md')
    expect(title).not.toContain('before.md')

    // And the content is still there, unsaved-work intact.
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('body text')
  })
})
