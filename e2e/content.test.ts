// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newDocument, openFile, useApp } from './helpers'

/**
 * Rich content: diagrams and images.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('mermaid diagrams', () => {
  it('renders a diagram below its fence', async () => {
    const file = join(ctx.workdir, 'diagram.md')
    await writeFile(file, '# Diagram\n\n```mermaid\ngraph TD\n  A-->B\n```\n', 'utf8')

    await openFile(ctx, file)

    // First use loads roughly a megabyte of library, so allow for that.
    await ctx.page.waitForSelector('.mermaid-figure svg', { timeout: 30_000 })
    const svg = await ctx.page.locator('.mermaid-figure svg').first()
    expect(await svg.count()).toBeGreaterThan(0)
  })

  it('shows an error inline instead of throwing on invalid syntax', async () => {
    const file = join(ctx.workdir, 'broken.md')
    await writeFile(file, '```mermaid\nnot a real diagram !!!\n```\n', 'utf8')

    await openFile(ctx, file)

    // More than one figure can be on the page, and rendering is async, so poll
    // for any of them reporting the failure rather than sampling the first.
    await ctx.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.mermaid-figure')].some((el) =>
          el.classList.contains('is-error')
        ),
      { timeout: 25_000 }
    )
    const texts = await ctx.page.locator('.mermaid-figure.is-error').allTextContents()
    expect(texts.join(' ')).toMatch(/diagram|syntax|error/i)
    // The source must survive a failed render: the fence is still editable text.
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('not a real diagram')
  })

  it('keeps the fence source intact when saved', async () => {
    const file = join(ctx.workdir, 'diagram.md')
    await openFile(ctx, file)
    await ctx.page.waitForTimeout(1500)
    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1200)

    const after = await readFile(file, 'utf8')
    expect(after).toContain('```mermaid')
    expect(after).toContain('graph TD')
  })
})
describe('pasted images', () => {
  it('writes the image beside the document and links it relatively', async () => {
    const { mkdir, readdir } = await import('node:fs/promises')
    const dir = join(ctx.workdir, 'withimages')
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'note.md')
    await writeFile(file, '# Has images\n\n', 'utf8')

    await openFile(ctx, file)
    await ctx.page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Has images') ?? false,
      { timeout: 15_000 }
    )

    // A real paste with a real PNG: a 1x1 image, built in the page and put on
    // the editor's clipboard as a File, which is what a screenshot paste looks
    // like to the handler.
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.evaluate(() => {
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const file = new File([bytes], 'pasted-shot.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      document
        .querySelector('.ProseMirror')!
        .dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        )
    })

    await ctx.page.waitForTimeout(2000)

    // The bytes must be on disk, in the assets folder next to the note.
    const assets = await readdir(join(dir, 'assets')).catch(() => [] as string[])
    expect(assets.some((f) => f.endsWith('.png'))).toBe(true)

    // And the image must show. A pasted image is drawn by the inline image
    // view, which was given the relative link as it stands: it resolved
    // against the app, not the note, and showed broken until the file was
    // opened again.
    await expect
      .poll(
        () =>
          ctx.page.evaluate(() => {
            const img = [...document.querySelectorAll('.ProseMirror img')].find((i) =>
              i.getAttribute('src')?.includes('pasted-shot')
            ) as HTMLImageElement | undefined
            return img?.naturalWidth ?? 0
          }),
        { timeout: 5000 }
      )
      .toBeGreaterThan(0)

    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1200)

    const saved = await readFile(file, 'utf8')
    // Relative, forward-slashed, and not a base64 blob.
    expect(saved).toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/)
    expect(saved).not.toContain('base64')
  })
})
describe('an image pasted into a document never saved', () => {
  it('is kept, and added once Save As gives it a folder', async () => {
    // It used to be a dialog saying the document had to be saved first, and
    // the image was gone: it had to be found and pasted again.
    const { mkdir, readdir } = await import('node:fs/promises')
    const dir = join(ctx.workdir, 'untitled-paste')
    await mkdir(dir, { recursive: true })
    const target = join(dir, 'saved-later.md')
    await newDocument(ctx)
    await ctx.page.keyboard.type('Before the picture.')
    await ctx.page.evaluate(() => {
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'held-shot.png', { type: 'image/png' }))
      document
        .querySelector('.ProseMirror')!
        .dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        )
    })

    const offer = ctx.page.locator('.note', { hasText: 'once this document is saved' })
    await offer.waitFor({ timeout: 5000 })
    await ctx.app.evaluate(async ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await offer.getByRole('button', { name: 'Save As…' }).click()

    await expect
      .poll(() => readdir(join(dir, 'assets')).catch(() => [] as string[]), { timeout: 10_000 })
      .toContainEqual(expect.stringMatching(/\.png$/))
    // And it shows: the editor was built with no folder to resolve it against,
    // and used that even after Save As gave it one.
    await expect
      .poll(() =>
        ctx.page.evaluate(() => {
          const img = [...document.querySelectorAll('.ProseMirror img')].find((i) =>
            i.getAttribute('src')?.includes('held-shot')
          ) as HTMLImageElement | undefined
          return img?.naturalWidth ?? 0
        })
      )
      .toBeGreaterThan(0)
  })
})

describe('relative images display', () => {
  it('loads an image linked relatively to the document', async () => {
    const { mkdir } = await import('node:fs/promises')
    const dir = join(ctx.workdir, 'shows')
    await mkdir(join(dir, 'assets'), { recursive: true })

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    await writeFile(join(dir, 'assets', 'pic.png'), png)
    const file = join(dir, 'note.md')
    await writeFile(file, '# Pic\n\n![a picture](assets/pic.png)\n', 'utf8')

    await openFile(ctx, file)
    // This document's image, by name: the previous test's document has one
    // too, and is still on screen until this one opens.
    await ctx.page.waitForSelector('.ProseMirror img[src*="pic.png"]', { timeout: 15_000 })

    // Writing the file and rendering it are different things: the earlier paste
    // test only checked the bytes landed, and the image still did not display.
    const info = () =>
      ctx.page.evaluate(() => {
        const img = document.querySelector('.ProseMirror img[src*="pic.png"]') as HTMLImageElement
        return { src: img.getAttribute('src'), loaded: img.naturalWidth > 0 }
      })
    await expect.poll(async () => (await info()).loaded, { timeout: 5000 }).toBe(true)
    expect((await info()).src).toContain('file://')

    // The markdown itself must stay relative, or the folder stops being portable.
    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1000)
    const saved = await readFile(file, 'utf8')
    expect(saved).toContain('(assets/pic.png)')
    expect(saved).not.toContain('file://')
  })
})
