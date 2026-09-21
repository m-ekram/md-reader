// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chooseMenu, menuItem, newDocument, openFile, useApp, waitForText } from './helpers'

/**
 * Task lists, footnotes, front matter, code tools and hyperlink actions.
 *
 * Asserted on the document and, where it matters, on the file after a save:
 * these all write to the markdown, so a command that looks right on screen and
 * serializes to something else is the failure worth catching.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const chooseItem = (menu: string, label: string) => chooseMenu(ctx, menu, label)
const chooseNested = (menu: string, submenu: string, label: string) =>
  chooseMenu(ctx, menu, submenu, label)

/**
 * Saves, and hands back what reached disk.
 *
 * Waits for the file's modification time to change, which is the write itself.
 * Not the title's unsaved marker: straight after typing, the marker may not
 * have appeared yet — the document store lags the editor by a debounce — so
 * "the marker is clear" could be true before the save had happened at all.
 */
async function savedText(path: string): Promise<string> {
  const before = (await stat(path)).mtimeMs
  await ctx.page.keyboard.press('Control+s')
  await expect.poll(async () => (await stat(path)).mtimeMs, { timeout: 10_000 }).not.toBe(before)
  return readFile(path, 'utf8')
}

describe('task lists', () => {
  const file = () => join(ctx.workdir, 'tasks.md')

  it('turns a list item into a task', async () => {
    await writeFile(file(), '- buy milk\n- walk dog\n', 'utf8')
    await openFile(ctx, file())
    await waitForText(ctx, 'buy milk')

    await ctx.page.locator('.ProseMirror li').first().click()
    await chooseItem('Paragraph', 'Task List')

    // Crepe renders list items through its own node view, so the schema's
    // data-item-type never reaches the DOM; the checkbox icon is the signal.
    await expect
      .poll(() => ctx.page.locator('.ProseMirror .label.unchecked').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)
  })

  it('writes an unchecked box to the file', async () => {
    const text = await savedText(file())
    expect(text).toContain('- [ ] buy milk')
    // The other item is untouched.
    expect(text).toContain('- walk dog')
  })

  it('marks it complete and writes a checked box', async () => {
    await ctx.page.locator('.ProseMirror li').first().click()
    await chooseNested('Paragraph', 'Task Status', 'Complete')

    await expect
      .poll(() => ctx.page.locator('.ProseMirror .label.checked').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)

    const text = await savedText(file())
    expect(text).toContain('- [x] buy milk')
  })

  it('greys out Task Status outside a task', async () => {
    // The second item was never made a task, so the submenu must not offer to
    // change a status it does not have.
    await ctx.page.locator('.ProseMirror li').nth(1).click()
    const complete = await menuItem(ctx, 'Paragraph', 'Task Status', 'Complete')
    await expect.poll(() => complete.getAttribute('aria-disabled')).toBe('true')
    await ctx.page.keyboard.press('Escape')
  })
})

describe('footnotes', () => {
  it('inserts a reference and a definition that survive a save', async () => {
    const file = join(ctx.workdir, 'footnote.md')
    await writeFile(file, 'A claim worth supporting.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'A claim worth supporting')

    await ctx.page.locator('.ProseMirror p').first().click()
    await ctx.page.keyboard.press('End')
    await chooseItem('Paragraph', 'Footnotes')
    await ctx.page.keyboard.type('the supporting detail')

    const text = await savedText(file)
    // Both halves, or the reference points at nothing.
    expect(text).toMatch(/\[\^1\]/)
    expect(text).toContain('the supporting detail')
  })
})

describe('YAML front matter', () => {
  const file = () => join(ctx.workdir, 'fm.md')

  it('adds a block at the top of the document', async () => {
    await writeFile(file(), '# Has no front matter\n', 'utf8')
    await openFile(ctx, file())
    await waitForText(ctx, 'Has no front matter')

    await ctx.page.locator('.ProseMirror').click()
    await chooseItem('Paragraph', 'YAML Front Matter')

    await expect
      .poll(() => ctx.page.locator('.ProseMirror .frontmatter').count(), { timeout: 10_000 })
      .toBe(1)
  })

  it('writes it as a fenced YAML block', async () => {
    const text = await savedText(file())
    expect(text.startsWith('---')).toBe(true)
    expect(text).toContain('title:')
  })

  it('is checked while it exists, and removes it again', async () => {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    const item = ctx.page
      .locator('.menu[role="menu"] .menu__item')
      .filter({ has: ctx.page.locator('.menu__label', { hasText: /^YAML Front Matter$/ }) })
      .first()
    expect(await item.getAttribute('aria-checked')).toBe('true')

    await item.click()
    await expect.poll(() => ctx.page.locator('.ProseMirror .frontmatter').count()).toBe(0)
  })
})

describe('hyperlink actions', () => {
  it('removes the link but keeps the words', async () => {
    const file = join(ctx.workdir, 'link.md')
    await writeFile(file, 'See [the docs](https://example.com) for more.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'the docs')

    expect(await ctx.page.locator('.ProseMirror a').count()).toBe(1)

    // Caret inside the link, which is what enables the submenu.
    await ctx.page.locator('.ProseMirror a').first().click()
    await chooseNested('Format', 'Hyperlink Actions', 'Remove Link')

    await expect.poll(() => ctx.page.locator('.ProseMirror a').count(), { timeout: 10_000 }).toBe(0)
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('the docs')

    const text = await savedText(file)
    expect(text).toContain('the docs')
    expect(text).not.toContain('https://example.com')
  })

  it('greys the actions out when the caret is not on a link', async () => {
    await ctx.page.locator('.ProseMirror p').first().click()
    const open = await menuItem(ctx, 'Format', 'Hyperlink Actions', 'Open Link')
    await expect.poll(() => open.getAttribute('aria-disabled')).toBe('true')
    await ctx.page.keyboard.press('Escape')
  })
})

describe('code tools', () => {
  it('copies the whole fence, not the selection inside it', async () => {
    const file = join(ctx.workdir, 'code.md')
    await writeFile(file, '```js\nconst a = 1\nconst b = 2\n```\n', 'utf8')
    await openFile(ctx, file)
    await ctx.page.waitForSelector('.milkdown-code-block', { timeout: 15_000 })

    await ctx.page.locator('.ProseMirror .cm-content').first().click()
    await chooseNested('Paragraph', 'Code Tools', 'Copy Code Block')

    // Read back through a paste, which is the only way to see the clipboard.
    await newDocument(ctx)
    await ctx.page.keyboard.press('Control+v')
    await waitForText(ctx, 'const b = 2')

    const pasted = await ctx.page.locator('.ProseMirror').innerText()
    expect(pasted).toContain('const a = 1')
    expect(pasted).toContain('const b = 2')
  })
})
