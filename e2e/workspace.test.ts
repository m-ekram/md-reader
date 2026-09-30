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

  it('reads nothing outside the open folder', async () => {
    // The page named any folder and main listed it.
    const read = (dir: string) =>
      ctx.page.evaluate(
        (d) =>
          window.api.workspace.readDir(d).then(
            () => 'read',
            () => 'refused'
          ),
        dir
      )
    expect(await read(join(notes(), 'sub'))).toBe('read')
    expect(await read(ctx.workdir)).toBe('refused')
    expect(await read(join(notes(), '..', 'userdata'))).toBe('refused')
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

  it('opens a result at its match, selected and in view', async () => {
    // A result opened its file at the top, and the match had to be found again.
    const filler = Array.from({ length: 200 }, (_, i) => `Filler paragraph ${i + 1}.`)
    await writeFile(
      join(notes(), 'far.md'),
      [
        '# Far',
        '',
        'A lighthouse near the top.',
        '',
        ...filler,
        '',
        'The lighthouse at the end.',
      ].join('\n\n'),
      'utf8'
    )
    await ctx.page.locator('.search__input').fill('lighthouse')
    await expect.poll(() => ctx.page.locator('.results__hit').count(), { timeout: 15_000 }).toBe(2)

    await ctx.page.locator('.results__hit', { hasText: 'at the end' }).click()

    await expect
      .poll(() => ctx.page.locator('.find__count').innerText(), { timeout: 15_000 })
      .toBe('2 of 2')
    await expect
      .poll(() =>
        ctx.page.evaluate(() => {
          const match = document.querySelector('.ProseMirror-active-search-match')
          const pane = document.querySelector('.editor-scroll')
          if (!match || !pane) return false
          const a = match.getBoundingClientRect()
          const b = pane.getBoundingClientRect()
          return a.top >= b.top && a.bottom <= b.bottom
        })
      )
      .toBe(true)
    await ctx.page.keyboard.press('Escape')
  })

  it('matches case when asked to', async () => {
    // Main could search by case; the panel had no way to ask.
    await ctx.page.locator('.search__input').fill('LIGHTHOUSE')
    await expect.poll(() => ctx.page.locator('.results__hit').count(), { timeout: 15_000 }).toBe(2)

    const toggle = ctx.page.getByRole('button', { name: 'Match case' })
    await toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-pressed')).toBe('true')
    await expect
      .poll(() => ctx.page.locator('.sidebar').innerText(), { timeout: 15_000 })
      .toContain('No matches')

    await toggle.click()
    await expect.poll(() => ctx.page.locator('.results__hit').count(), { timeout: 15_000 }).toBe(2)
  })

  it('reloads a clean document when the file changes on disk', async () => {
    await showPanel('articles')
    await ctx.page.locator('.articles__item', { hasText: 'first.md' }).first().click()
    await waitForText(ctx, 'First note')

    await writeFile(join(notes(), 'first.md'), '# Rewritten externally\n\nnew body\n', 'utf8')
    // Clean document: no prompt, it should just follow the file.
    await waitForText(ctx, 'Rewritten externally')
  })

  it('shows a file changed while its tab was in the background, on return', async () => {
    // third.md was shown earlier, so its editor is pooled. It used to come
    // back as that editor, with the text from before the change: the reload
    // reached the document, and only an active document's editor was rebuilt.
    await writeFile(join(notes(), 'sub', 'third.md'), '# Third, rewritten\n\nwhile away\n', 'utf8')
    // Then the active file. Written second, its reload is the signal that
    // the watcher has reached the first one too.
    await writeFile(join(notes(), 'first.md'), '# First, again\n', 'utf8')
    await waitForText(ctx, 'First, again')

    await ctx.page.locator('.tab__select', { hasText: 'third.md' }).click()
    await waitForText(ctx, 'Third, rewritten')

    // Back to where the next test expects to be.
    await ctx.page.locator('.tab__select', { hasText: 'first.md' }).click()
    await waitForText(ctx, 'First, again')
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

  it('follows the disk in the file tree, keeping open folders open', async () => {
    // The tree was read once, when the folder opened: files and folders made
    // or deleted afterwards never showed, or never went away.
    await watcherReady(ctx, notes())
    await showPanel('files')
    const sub = ctx.page.locator('.tree__item', { hasText: 'sub' }).first()
    if ((await ctx.page.locator('.tree__name', { hasText: 'third.md' }).count()) === 0) {
      await sub.click()
    }
    await expect.poll(allText('.tree__name')).toContain('third.md')

    await mkdir(join(notes(), 'fresh'))
    await writeFile(join(notes(), 'fresh', 'inside.md'), '# Inside\n', 'utf8')
    await writeFile(join(notes(), 'sub', 'also.md'), '# Also\n', 'utf8')
    await expect
      .poll(allText('.tree__name'), { timeout: 15_000 })
      .toEqual(expect.arrayContaining(['fresh', 'also.md', 'third.md']))

    await rm(join(notes(), 'fresh'), { recursive: true, force: true })
    await expect.poll(allText('.tree__name'), { timeout: 15_000 }).not.toContain('fresh')
    // Still open, as it was left.
    expect(await allText('.tree__name')()).toContain('also.md')
  })

  it('is a tree the keyboard can walk', async () => {
    // Every row was its own Tab stop, with no arrow keys and no tree roles for
    // a screen reader to announce.
    const focused = () =>
      ctx.page.evaluate(() => document.activeElement?.querySelector('.tree__name')?.textContent)
    const expanded = () =>
      ctx.page.locator('.tree__item', { hasText: /^\W*sub$/ }).getAttribute('aria-expanded')

    expect(await ctx.page.locator('[role="tree"] [role="treeitem"]').count()).toBeGreaterThan(3)
    await ctx.page.locator('.tree__item', { hasText: /^\W*sub$/ }).focus()
    expect(await ctx.page.locator('[role="tree"] [tabindex="0"]').count()).toBe(1)

    expect(await expanded()).toBe('true')
    await ctx.page.keyboard.press('ArrowLeft')
    await expect.poll(expanded).toBe('false')
    await ctx.page.keyboard.press('ArrowRight')
    await expect.poll(expanded).toBe('true')
    await ctx.page.keyboard.press('ArrowRight')
    await expect.poll(focused).toBe('also.md')
    await ctx.page.keyboard.press('ArrowDown')
    await expect.poll(focused).toBe('third.md')
    await ctx.page.keyboard.press('ArrowLeft')
    await expect.poll(focused).toBe('sub')
    // The Tab stop follows the focus.
    expect(await ctx.page.locator('[role="tree"] [tabindex="0"]').innerText()).toContain('sub')

    await ctx.page.keyboard.press('ArrowRight')
    await ctx.page.keyboard.press('Enter')
    await waitForText(ctx, 'Also')
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
    // A combobox naming its highlighted file, for a screen reader.
    expect(
      await ctx.page.evaluate(() => {
        const input = document.querySelector('.quick__input')!
        const id = input.getAttribute('aria-activedescendant')
        return `${input.getAttribute('role')} ${id ? document.getElementById(id)?.textContent : ''}`
      })
    ).toMatch(/^combobox second\.md/)

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

  it('leaves the file ready to type in, and so does the file tree', async () => {
    // The focus stayed in the list, or on the page itself, so typing straight
    // after opening a file went nowhere.
    const notes = join(ctx.workdir, 'notes')
    await writeFile(join(notes, 'type-here.md'), '# Type here\n', 'utf8')
    await writeFile(join(notes, 'and-here.md'), '# And here\n', 'utf8')
    await expect
      .poll(allText('.tree__name'), { timeout: 15_000 })
      .toEqual(expect.arrayContaining(['type-here.md', 'and-here.md']))

    await ctx.page.keyboard.press('Control+p')
    await ctx.page.locator('.quick__input').fill('type-here')
    await expect.poll(async () => (await allText('.quick__name')())[0]).toBe('type-here.md')
    await ctx.page.keyboard.press('Enter')
    await waitForText(ctx, 'Type here')
    await ctx.page.keyboard.type('Typed at once.')
    await waitForText(ctx, 'Typed at once.')

    await ctx.page.locator('.tree__item', { hasText: 'and-here.md' }).click()
    await waitForText(ctx, 'And here')
    await ctx.page.keyboard.type('Typed here too.')
    await waitForText(ctx, 'Typed here too.')
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
    // Options third: second, they were taken for the page function's argument.
    await ctx.page.waitForFunction(() => document.title.includes('after.md'), null, {
      timeout: 20_000,
    })
    expect(await ctx.page.title()).not.toContain('before.md')

    // And the content is still there, unsaved-work intact.
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('body text')
  })
})

describe('Close Folder', () => {
  const current = () => ctx.page.evaluate(() => window.api.workspace.current())

  it('is in the command palette', async () => {
    // A folder, once open, could only be swapped for another.
    await showPanel('files')
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+Shift+P')
    await ctx.page.locator('.palette__input').fill('close folder')
    await ctx.page.locator('.palette__item', { hasText: 'Close Folder' }).first().click()

    await expect.poll(current).toBeNull()
    // Nothing left for the sidebar to show, so it goes, as it started.
    await expect.poll(() => ctx.page.locator('.sidebar').count()).toBe(0)
  })

  it('is a button beside the folder’s name', async () => {
    const dir = join(ctx.workdir, 'renames')
    await ctx.page.evaluate((root) => window.api.workspace.set(root), dir)
    await showPanel('files')
    await ctx.page.getByRole('button', { name: 'Close Folder' }).click()
    await expect.poll(current).toBeNull()
  })
})
