// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { nextFrames, noticeTexts, openFile, useApp, waitForText } from './helpers'

/**
 * Export, asserted on the file that lands on disk.
 *
 * The save dialog is native and cannot be driven from the page, so it is
 * replaced in the main process for the duration of the suite. Everything after
 * the dialog — cleaning, sanitizing, inlining, writing — is the real path.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const DOC = [
  '# Export Me',
  '',
  'A paragraph with **bold** text and a [link](https://example.com).',
  '',
  '```js',
  'const answer = 42',
  '```',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '> [!NOTE]',
  '> Worth noticing.',
  '',
  '- one',
  '- two',
  '',
  '![a picture](pic.png)',
].join('\n')

/** A one-pixel PNG, so the document has a real local image to inline. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** Points the next save dialog at a known path instead of showing it. */
async function stubSaveDialog(target: string): Promise<void> {
  await ctx.app.evaluate(async ({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, target)
}

async function cancelNextSaveDialog(): Promise<void> {
  await ctx.app.evaluate(async ({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' })
  })
}

async function chooseExport(label: string): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.locator('.menubar__top', { hasText: /^File$/ }).click()
  await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
  await ctx.page.locator('.menu__item', { hasText: 'Export' }).first().click()
  await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
  await ctx.page.locator('.menu--nested .menu__item', { hasText: label }).first().click()
}

async function openFixture(): Promise<void> {
  const file = join(ctx.workdir, 'export-me.md')
  await writeFile(file, DOC, 'utf8')
  await writeFile(join(ctx.workdir, 'pic.png'), Buffer.from(PNG_BASE64, 'base64'))
  await openFile(ctx, file)
  await waitForText(ctx, 'Export Me')
  // Code blocks mount asynchronously; exporting before they exist would assert
  // against a document the user never saw.
  await ctx.page.waitForSelector('.milkdown-code-block', { timeout: 15_000 })
}

describe('HTML export', () => {
  const target = () => join(ctx.workdir, 'out.html')

  it('writes a self-contained file', async () => {
    await openFixture()
    await stubSaveDialog(target())
    await chooseExport('HTML')

    await expect.poll(() => existsSync(target()), { timeout: 20_000 }).toBe(true)
    const html = await readFile(target(), 'utf8')

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>export-me</title>')
    // Styles are inlined, not linked: a link would break the moment the file
    // was sent to anyone.
    expect(html).not.toMatch(/<link[^>]+stylesheet/)
    expect(html).toContain('--doc-bg')
  })

  it('carries the document content, not the editor furniture', async () => {
    const html = await readFile(target(), 'utf8')
    // Scoped to the body: the inlined stylesheet legitimately contains
    // `.milkdown .ProseMirror` selectors, and asserting against the whole file
    // would be checking the CSS rather than the document.
    const body = html.slice(html.indexOf('<article'))

    expect(html).toContain('Export Me')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('const answer = 42')
    expect(html).toContain('data-alert="note"')
    expect(html).toContain('Worth noticing.')

    expect(body).not.toContain('contenteditable')
    expect(body).not.toContain('cm-content')
    expect(body).not.toContain('copy-button')
    expect(body).not.toContain('ProseMirror')
    expect(body).not.toContain('milkdown-')
  })

  it('embeds the image rather than linking it', async () => {
    const html = await readFile(target(), 'utf8')
    // The exported file has to survive being sent somewhere else, so a
    // relative link to pic.png is a broken image.
    expect(html).toContain('data:image/png;base64,')
    expect(html).not.toContain('src="pic.png"')
    expect(html).not.toContain('src="file://')
  })

  it('reports where it went', async () => {
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '), { timeout: 10_000 })
      .toContain('out.html')
  })

  it('offers to open it, and opens nothing else', async () => {
    await ctx.app.evaluate(({ shell }) => {
      const g = globalThis as unknown as { opened: string[] }
      g.opened = []
      shell.openPath = async (p: string) => {
        g.opened.push(p)
        return ''
      }
    })
    const opened = () =>
      ctx.app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)

    await ctx.page
      .locator('.note', { hasText: 'out.html' })
      .getByRole('button', { name: 'Open' })
      .click()
    await expect.poll(opened).toEqual([target()])
    // The message has done its job.
    expect((await noticeTexts(ctx)).join(' ')).not.toContain('out.html')

    // The page cannot use the same door for a file it did not export.
    const refused = await ctx.page.evaluate(
      (p) => window.api.export.open(p),
      join(ctx.workdir, 'export-me.md')
    )
    expect(refused).not.toBe('')
    expect(await opened()).toEqual([target()])
  })

  it('writes nothing when the dialog is cancelled', async () => {
    const cancelled = join(ctx.workdir, 'never-written.html')
    await cancelNextSaveDialog()
    await chooseExport('HTML')
    await ctx.page.waitForTimeout(1500)
    expect(existsSync(cancelled)).toBe(false)
  })
})

describe('export from the source view', () => {
  it('exports the formatted document, not nothing', async () => {
    // It read the formatted view off the screen, and the source view has
    // none: "Nothing to export".
    const target = join(ctx.workdir, 'from-source.html')
    await openFixture()
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.cm-content', { state: 'visible', timeout: 15_000 })

    await stubSaveDialog(target)
    await chooseExport('HTML')
    await expect.poll(() => existsSync(target), { timeout: 20_000 }).toBe(true)
    const html = await readFile(target, 'utf8')
    expect(html).toContain('Export Me')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('const answer = 42')
    expect(html).toContain('data-alert="note"')
    expect(html).toContain('data:image/png;base64,')

    await ctx.page.locator('.cm-content').click()
    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 15_000 })
  })
})

describe('export of a long document', () => {
  it('keeps the code of blocks that were out of sight', async () => {
    // Code blocks start their editor only once scrolled into view. Until then
    // they hold the text in a placeholder, which the export did not read: a
    // block below the fold exported empty.
    const file = join(ctx.workdir, 'long-code.md')
    const filler = Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1}.`)
    const markdown = ['# Long', '', ...filler, '', '```js', "const far = 'below'", '```', ''].join(
      '\n\n'
    )
    await writeFile(file, markdown, 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Paragraph 150.')

    const target = join(ctx.workdir, 'long-code.html')
    await stubSaveDialog(target)
    await chooseExport('HTML')
    await expect.poll(() => existsSync(target), { timeout: 20_000 }).toBe(true)
    expect(await readFile(target, 'utf8')).toContain('const far')
  })
})

describe('PDF export', () => {
  it('writes a real PDF, laid out as the page setup says', async () => {
    // Every PDF was A4 portrait, with no page numbers and no way to ask.
    const target = join(ctx.workdir, 'out.pdf')
    await stubSaveDialog(target)
    await chooseExport('PDF')

    const setup = ctx.page.getByRole('dialog', { name: 'Page setup' })
    await setup.waitFor()
    // Starts from the default the first time.
    expect(await setup.getByRole('combobox', { name: 'Paper' }).inputValue()).toBe('A4')
    await setup.getByRole('combobox', { name: 'Paper' }).selectOption('Letter')
    await setup.getByRole('radio', { name: 'Landscape' }).check()
    await setup.getByRole('checkbox', { name: 'Page numbers' }).check()
    await setup.getByRole('button', { name: 'Export' }).click()

    await expect.poll(() => existsSync(target), { timeout: 40_000 }).toBe(true)
    const bytes = await readFile(target)

    // The magic number, not just a non-empty file: printToPDF failing halfway
    // would still leave something on disk.
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(1000)
    // Letter, on its side: 11 × 8.5 inches, in points.
    expect(bytes.toString('latin1')).toMatch(/\/MediaBox \[0 0 792 612\]/)
  }, 60_000)

  it('remembers the page setup, and Cancel exports nothing', async () => {
    const target = join(ctx.workdir, 'not-written.pdf')
    await stubSaveDialog(target)
    await chooseExport('PDF')
    const setup = ctx.page.getByRole('dialog', { name: 'Page setup' })
    await setup.waitFor()
    expect(await setup.getByRole('combobox', { name: 'Paper' }).inputValue()).toBe('Letter')
    expect(await setup.getByRole('radio', { name: 'Landscape' }).isChecked()).toBe(true)
    await setup.getByRole('button', { name: 'Cancel' }).click()
    await setup.waitFor({ state: 'detached' })
    await nextFrames(ctx)
    expect(existsSync(target)).toBe(false)
  })
})
