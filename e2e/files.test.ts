// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  chooseMenu,
  menuItem,
  newDocument,
  noticeTexts,
  openFile,
  useApp,
  waitForText,
} from './helpers'

/**
 * Opening, saving and recovering files.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('the save path preserves the file', () => {
  it('writes back a file it did not change, byte for byte', async () => {
    const file = join(ctx.workdir, 'note.md')
    const original =
      '---\ntitle: Test\ntags: [a, b]\n---\n\n# Heading\n\n- one\n- two\n\nSome **bold** text.\n'
    await writeFile(file, original, 'utf8')

    // Open through main, exactly as the File menu would.
    await openFile(ctx, file)

    await ctx.page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Heading') ?? false,
      { timeout: 15_000 }
    )

    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1200)

    expect(await readFile(file, 'utf8')).toBe(original)
  })
})
describe('Open Recent stays in step with its labels', () => {
  it('opens the file it names after the list is reordered', async () => {
    const a = join(ctx.workdir, 'alpha.md')
    const b = join(ctx.workdir, 'beta.md')
    await writeFile(a, '# Alpha document\n', 'utf8')
    await writeFile(b, '# Beta document\n', 'utf8')

    for (const p of [a, b]) {
      await openFile(ctx, p)
      await ctx.page.waitForTimeout(700)
    }

    // Start from a known state: an earlier test may have left a menu open, and
    // hovering a submenu that is already open does not re-trigger it.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.waitForTimeout(150)

    await ctx.page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })

    // Clicking is deterministic where hovering depends on pointer timing.
    await ctx.page.locator('.menu__item', { hasText: 'Open Recent' }).first().click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible', timeout: 5000 })

    const first = ctx.page.locator('.menu--nested .menu__item').first()
    const label = (await first.innerText()).trim()
    await first.click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'detached', timeout: 5000 })
    await ctx.page.waitForTimeout(600)

    // Whichever file the entry named must be the one now on screen.
    const expected = label.startsWith('alpha') ? 'Alpha document' : 'Beta document'
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain(expected)
  })
})
describe('documents are labelled by filename, not by path', () => {
  it('shows the bare filename in the window title and the tab', async () => {
    // This existed as a bug: the path split handled forward slashes only, so on
    // Windows every opened file was labelled with its entire path. 240 tests
    // passed because none of them looked at what was displayed.
    const file = join(ctx.workdir, 'labelled.md')
    await writeFile(file, '# Labelled\n', 'utf8')

    await openFile(ctx, file)
    await ctx.page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Labelled') ?? false,
      { timeout: 15_000 }
    )

    // Not String.raw: a raw template cannot end in a backslash, since it would
    // escape its own closing backtick.
    const SEP = '\\'

    const title = await ctx.page.evaluate(() => document.title)
    expect(title).toContain('labelled.md')
    expect(title).not.toContain(SEP)
    expect(title).not.toContain('Temp')

    const tabs = await ctx.page.locator('.tab__name').allTextContents()
    expect(tabs.some((t) => t.trim() === 'labelled.md')).toBe(true)
    expect(tabs.every((t) => !t.includes(SEP))).toBe(true)
  })
})
describe('Data Recovery restores the version kept before the last save', () => {
  it('offers the backup and puts it back in the editor', async () => {
    const file = join(ctx.workdir, 'recoverable.md')
    await writeFile(file, '# Original content\n\nthe good version\n', 'utf8')

    await openFile(ctx, file)
    await ctx.page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('the good version') ?? false,
      { timeout: 15_000 }
    )

    // Wreck it and save, twice, which is what bad saves look like from the
    // user's side. Each save keeps the bytes it replaced. Only the last was
    // kept, so the second bad save lost the good version.
    const wreckAndSave = async (text: string) => {
      await ctx.page.locator('.ProseMirror').click()
      await ctx.page.keyboard.press('Control+a')
      await ctx.page.keyboard.type(text)
      await waitForText(ctx, text)
      await ctx.page.keyboard.press('Control+s')
      await expect.poll(() => readFile(file, 'utf8')).toContain(text)
    }
    await wreckAndSave('ruined once')
    await wreckAndSave('ruined twice')

    // Help > Data Recovery lists both versions, newest first.
    await chooseMenu(ctx, 'Help', 'Data Recovery and Version Control')
    const dialog = ctx.page.getByRole('dialog', { name: /^Versions of recoverable\.md$/ })
    await expect.poll(() => dialog.getByRole('option').count()).toBe(2)

    // The older one, shown against the text now.
    await dialog.getByRole('option').nth(1).click()
    await expect
      .poll(() => dialog.locator('.history__line--add').allInnerTexts())
      .toContainEqual(expect.stringContaining('the good version'))
    expect(await dialog.locator('.history__line--del').allInnerTexts()).toContainEqual(
      expect.stringContaining('ruined twice')
    )

    await dialog.getByRole('button', { name: 'Restore this version' }).click()
    await waitForText(ctx, 'the good version')
    // Restoring does not touch the disk until the user saves.
    expect(await readFile(file, 'utf8')).toContain('ruined twice')
    await expect.poll(() => ctx.page.title()).toMatch(/^•/)
  })
})

describe('Reload from Disk', () => {
  it('shows the file as it is on disk, and saves that, not the discarded edit', async () => {
    const file = join(ctx.workdir, 'reload.md')
    await writeFile(file, 'The first version.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'The first version.')

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('End')
    await ctx.page.keyboard.type(' An edit to throw away.')
    await waitForText(ctx, 'An edit to throw away.')

    // Another program rewrites the file. It was opened on its own, outside a
    // workspace, so no watcher reloads it: only the command does.
    await writeFile(file, 'The version on disk.\n', 'utf8')

    // The edit is unsaved, so the command asks first; answer Don't Save.
    await ctx.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 1,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox
    })
    await chooseMenu(ctx, 'File', 'Reload from Disk')

    // On screen: the disk version, not the old text with the edit.
    await waitForText(ctx, 'The version on disk.')
    expect(await ctx.page.locator('.ProseMirror').innerText()).not.toContain('first version')

    // And a save writes what is on screen, not the discarded text.
    await ctx.page.keyboard.press('Control+s')
    await expect
      .poll(() => readFile(file, 'utf8'), { timeout: 10_000 })
      .toBe('The version on disk.\n')
  })
})

describe('a recent file that is gone', () => {
  it('says so, and drops it from Open Recent', async () => {
    const file = join(ctx.workdir, 'gone.md')
    await writeFile(file, '# Soon gone\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Soon gone')
    await unlink(file)

    // It used to do nothing at all: the failed read went nowhere, and the
    // entry stayed in the list to fail again.
    await chooseMenu(ctx, 'File', 'Open Recent', 'gone.md')
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '), { timeout: 5000 })
      .toContain('gone.md')

    await (await menuItem(ctx, 'File', 'Open Recent')).click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
    const labels = await ctx.page
      .locator('.menu--nested .menu__label')
      .evaluateAll((els) => els.map((e) => e.textContent?.trim()))
    expect(labels).not.toContain('gone.md')
    await ctx.page.keyboard.press('Escape')
  })
})

describe('dropping a markdown file onto the window', () => {
  it('opens it in a new tab, with its name and its text', async () => {
    // A synthetic drop: Playwright cannot drag from the desktop, and a file it
    // makes has no path on disk, so this exercises the no-path branch. A real
    // file from Explorer has a path and opens the way File > Open does.
    await ctx.page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['# Dropped in\n\nFrom a drag.\n'], 'dropped.md', { type: '' }))
      const target = document.querySelector('.ProseMirror') ?? document.body
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true })
        )
      }
    })
    await waitForText(ctx, 'From a drag.')
    await expect
      .poll(() => ctx.page.locator('.tab__name').allTextContents())
      .toContain('dropped.md')
  })
})

describe('changing line endings', () => {
  it('is an edit: marked unsaved, and written on save', async () => {
    // It changed what the next save would write while the document read as
    // unchanged, so closing it dropped the change without asking.
    const file = join(ctx.workdir, 'endings.md')
    await writeFile(file, 'First line\n\nSecond line\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Second line')

    await chooseMenu(ctx, 'Edit', 'Line Endings', 'Windows (CRLF)')
    await expect.poll(() => ctx.page.locator('.titlebar__title').innerText()).toMatch(/^•/)

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+s')
    await expect.poll(async () => (await readFile(file, 'utf8')).includes('\r\n')).toBe(true)
    await expect.poll(() => ctx.page.locator('.titlebar__title').innerText()).not.toMatch(/^•/)
  })
})

describe('a file that cannot be opened', () => {
  it('says so, naming it', async () => {
    // From the sidebar, Open Quickly or Explorer, a failed open went to the
    // log and nowhere else: the click simply did nothing.
    await openFile(ctx, join(ctx.workdir, 'moved-away.md'))
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '), { timeout: 10_000 })
      .toContain('moved-away.md')
    expect((await noticeTexts(ctx)).join(' ')).toContain('no longer')
  })
})

describe('File > Delete with unsaved changes', () => {
  it('keeps the unsaved changes open', async () => {
    // It closed the tab outright: the file went to the Recycle Bin, and the
    // edits typed since its last save went nowhere.
    const file = join(ctx.workdir, 'binned.md')
    await writeFile(file, 'Saved text.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Saved text.')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' Typed since.')
    await waitForText(ctx, 'Typed since.')

    await ctx.app.evaluate(({ dialog, shell }) => {
      dialog.showMessageBox = (async () => ({
        response: 0,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox
      // No Recycle Bin here; what matters is that the file is gone.
      const fs = process.mainModule!.require('node:fs') as typeof import('node:fs')
      shell.trashItem = async (p: string) => fs.unlinkSync(p)
    })
    await chooseMenu(ctx, 'File', 'Delete')

    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '))
      .toContain('unsaved changes are still open')
    await waitForText(ctx, 'Typed since.')
  })
})

describe('two files with the same name', () => {
  it('have tabs that tell them apart', async () => {
    // Two README.md files made two identical tabs.
    const { mkdir } = await import('node:fs/promises')
    for (const folder of ['app', 'lib']) {
      await mkdir(join(ctx.workdir, folder), { recursive: true })
      await writeFile(join(ctx.workdir, folder, 'README.md'), `# ${folder}\n`, 'utf8')
      await openFile(ctx, join(ctx.workdir, folder, 'README.md'))
      await waitForText(ctx, folder)
    }
    const names = await ctx.page.locator('.tab__name', { hasText: 'README.md' }).allInnerTexts()
    expect(names).toHaveLength(2)
    expect(new Set(names).size, `tabs read ${JSON.stringify(names)}`).toBe(2)
  })
})

describe('Save As for a document never saved', () => {
  it('suggests a name from its first heading', async () => {
    // It suggested "Untitled.md", so every new note began with a rename.
    await ctx.app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { suggested: string[] }
      g.suggested = []
      dialog.showSaveDialog = (async (_w: unknown, opts: { defaultPath?: string }) => {
        g.suggested.push(opts.defaultPath ?? '')
        return { canceled: true, filePath: '' }
      }) as unknown as typeof dialog.showSaveDialog
    })
    await newDocument(ctx)
    await ctx.page.keyboard.type('# Trip to Lisbon: day 1')
    await waitForText(ctx, 'Trip to Lisbon')
    await ctx.page.keyboard.press('Control+Shift+s')

    await expect
      .poll(() =>
        ctx.app.evaluate(() => (globalThis as unknown as { suggested: string[] }).suggested)
      )
      .toEqual(['Trip to Lisbon day 1.md'])
  })
})
