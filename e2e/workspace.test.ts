// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { noticeTexts, openFile, useApp, waitForText, watcherReady } from './helpers'

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

  it('has its own right-click menu in the file tree, worked by the keyboard', async () => {
    // The tree had no right-click menu: files could be made, renamed and
    // deleted only outside the app.
    await ctx.app.evaluate(({ Menu }) => {
      const g = globalThis as unknown as { __nativeMenu?: boolean }
      g.__nativeMenu = false
      Menu.prototype.popup = function () {
        g.__nativeMenu = true
      }
    })
    await showPanel('files')
    const row = ctx.page.locator('.tree__item', { hasText: 'second.md' })
    await row.click({ button: 'right' })
    const menu = ctx.page.locator('.context-menu')
    await menu.waitFor({ state: 'visible' })
    expect(await menu.locator('[role="menuitem"]').allInnerTexts()).toEqual(
      expect.arrayContaining(['Show in Folder', 'Copy Path'])
    )
    // Only the app's own: the native one would have shown over it.
    expect(
      await ctx.app.evaluate(
        () => (globalThis as unknown as { __nativeMenu?: boolean }).__nativeMenu
      )
    ).toBe(false)

    // Copy Path is last: End, then Enter.
    const focused = () => ctx.page.evaluate(() => document.activeElement?.textContent?.trim())
    await ctx.page.keyboard.press('ArrowDown')
    expect(await focused()).not.toBe('Open')
    await ctx.page.keyboard.press('End')
    expect(await focused()).toBe('Copy Path')
    await ctx.page.keyboard.press('Enter')
    await menu.waitFor({ state: 'detached' })
    await expect
      .poll(() => ctx.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(join(notes(), 'second.md'))
    // Back to the row it was opened on.
    expect(await ctx.page.evaluate(() => document.activeElement?.textContent)).toContain(
      'second.md'
    )

    await row.click({ button: 'right' })
    await menu.waitFor({ state: 'visible' })
    await ctx.page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
  })

  it('makes files and folders from the right-click menu, never over one', async () => {
    // Files could be made only outside the app.
    const panel = ctx.page.locator('.tree-panel')
    const below = async () => {
      const box = (await panel.boundingBox())!
      await panel.click({ button: 'right', position: { x: 30, y: box.height - 10 } })
    }
    const choose = async (label: string) => {
      await ctx.page.locator('.context-menu [role="menuitem"]', { hasText: label }).click()
    }
    const nameBox = ctx.page.locator('.tree__name-input')

    await below()
    await choose('New Folder')
    await nameBox.fill('made-here')
    await nameBox.press('Enter')
    await expect.poll(() => existsSync(join(notes(), 'made-here'))).toBe(true)

    await ctx.page.locator('.tree__item', { hasText: 'made-here' }).click({ button: 'right' })
    await choose('New File')
    await nameBox.fill('fresh-note')
    await nameBox.press('Enter')
    await expect.poll(() => existsSync(join(notes(), 'made-here', 'fresh-note.md'))).toBe(true)
    // Open, and ready to type in.
    await expect.poll(() => ctx.page.title()).toContain('fresh-note.md')
    await ctx.page.keyboard.type('Written straight away.')
    await waitForText(ctx, 'Written straight away.')

    // A name that is taken: said, and the file left alone.
    await below()
    await choose('New File')
    await nameBox.fill('second')
    await nameBox.press('Enter')
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '))
      .toContain('second.md is already there')
    expect(await readFile(join(notes(), 'second.md'), 'utf8')).toContain('Second note')
  })

  it('renames from the right-click menu, taking open documents along', async () => {
    // Renaming was only possible outside the app, and an open file's tab then
    // had to find it again. Here the open, unsaved note moves with its folder.
    const rename = async (row: string, name: string) => {
      await ctx.page.locator('.tree__item', { hasText: row }).first().click({ button: 'right' })
      await ctx.page.locator('.context-menu [role="menuitem"]', { hasText: 'Rename' }).click()
      const box = ctx.page.locator('.tree__name-input')
      await box.fill(name)
      await box.press('Enter')
    }

    await rename('made-here', 'renamed-here')
    await expect.poll(() => existsSync(join(notes(), 'renamed-here', 'fresh-note.md'))).toBe(true)
    expect(existsSync(join(notes(), 'made-here'))).toBe(false)
    // The unsaved text is saved to where the file is now.
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+s')
    await expect
      .poll(() => readFile(join(notes(), 'renamed-here', 'fresh-note.md'), 'utf8'))
      .toContain('Written straight away.')

    // A file keeps its extension when the new name has none.
    await ctx.page.locator('.tree__item', { hasText: 'renamed-here' }).click()
    await rename('fresh-note.md', 'kept-note')
    await expect.poll(() => existsSync(join(notes(), 'renamed-here', 'kept-note.md'))).toBe(true)
    await expect.poll(() => ctx.page.title()).toContain('kept-note.md')

    // Never onto a name that is taken.
    await rename('kept-note.md', '../second')
    await expect.poll(async () => (await noticeTexts(ctx)).join(' ')).toContain('cannot contain')
    expect(existsSync(join(notes(), 'renamed-here', 'kept-note.md'))).toBe(true)
  })

  it('deletes to the Recycle Bin, after asking, keeping unsaved work open', async () => {
    // The Recycle Bin is replaced by a plain delete, which WSL has no other
    // way to do, and the question is answered yes and recorded.
    await ctx.app.evaluate(({ dialog, shell }) => {
      const g = globalThis as unknown as { asked: string[] }
      g.asked = []
      dialog.showMessageBox = (async (_w: unknown, o: { message: string }) => {
        g.asked.push(o.message)
        return { response: 0, checkboxChecked: false }
      }) as unknown as typeof dialog.showMessageBox
      shell.trashItem = async (p: string) => {
        const fs = process.mainModule!.require('node:fs') as typeof import('node:fs')
        fs.rmSync(p, { recursive: true, force: true })
      }
    })
    const del = async (row: string) => {
      await ctx.page.locator('.tree__item', { hasText: row }).first().click({ button: 'right' })
      await ctx.page.locator('.context-menu [role="menuitem"]', { hasText: 'Delete' }).click()
    }
    const tabs = () => ctx.page.locator('.tab__name').allInnerTexts()

    // A saved open document in a deleted folder: its tab closes.
    await del('renamed-here')
    await expect.poll(() => existsSync(join(notes(), 'renamed-here'))).toBe(false)
    await expect.poll(tabs).not.toContain('kept-note.md')
    expect(
      await ctx.app.evaluate(() => (globalThis as unknown as { asked: string[] }).asked)
    ).toEqual(['Move “renamed-here” to the Recycle Bin?'])

    // One with unsaved work: kept open, and said to be gone from disk.
    const doomed = join(notes(), 'doomed.md')
    await writeFile(doomed, '# Doomed\n', 'utf8')
    await openFile(ctx, doomed)
    await waitForText(ctx, 'Doomed')
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' Not saved.')
    await waitForText(ctx, 'Not saved.')
    await expect.poll(allText('.tree__name')).toContain('doomed.md')
    await del('doomed.md')
    await expect.poll(() => existsSync(doomed)).toBe(false)
    await ctx.page.waitForSelector('.status .detached')
    await waitForText(ctx, 'Not saved.')
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

  it('searches by pattern and by whole word, and reads UTF-16 files', async () => {
    // The folder search took text only, and read every file as UTF-8: a
    // UTF-16 file looked like binary and was never searched.
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('# Wide\n\nA lighthouse in UTF-16.\n', 'utf16le'),
    ])
    await writeFile(join(notes(), 'wide.md'), utf16)
    const previews = () => ctx.page.locator('.results__preview').allInnerTexts()
    const button = (name: string) => ctx.page.getByRole('button', { name })

    await ctx.page.locator('.search__input').fill('lighthouse')
    await expect
      .poll(previews, { timeout: 15_000 })
      .toContainEqual(expect.stringContaining('in UTF-16'))

    await button('Regular expression').click()
    await ctx.page.locator('.search__input').fill('light(house|s)?\\b')
    await expect.poll(async () => (await previews()).length, { timeout: 15_000 }).toBe(3)

    // A pattern that will not compile says so, instead of finding nothing.
    await ctx.page.locator('.search__input').fill('light(')
    await expect
      .poll(() => ctx.page.locator('.sidebar').innerText(), { timeout: 15_000 })
      .toContain('Invalid pattern')
    await button('Regular expression').click()

    // "light" alone is part of every lighthouse, but no whole word.
    await ctx.page.locator('.search__input').fill('light')
    await expect.poll(async () => (await previews()).length, { timeout: 15_000 }).toBe(3)
    await button('Whole word').click()
    await expect
      .poll(() => ctx.page.locator('.sidebar').innerText(), { timeout: 15_000 })
      .toContain('No matches')
    await button('Whole word').click()
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
