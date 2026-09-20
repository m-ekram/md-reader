// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp } from './helpers'

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

    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1200)

    const saved = await readFile(file, 'utf8')
    // Relative, forward-slashed, and not a base64 blob.
    expect(saved).toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/)
    expect(saved).not.toContain('base64')
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
    await ctx.page.waitForSelector('.ProseMirror img', { timeout: 15_000 })

    // Writing the file and rendering it are different things: the earlier paste
    // test only checked the bytes landed, and the image still did not display.
    const info = await ctx.page.evaluate(() => {
      const img = document.querySelector('.ProseMirror img') as HTMLImageElement | null
      return img ? { src: img.getAttribute('src'), loaded: img.naturalWidth > 0 } : null
    })
    expect(info?.loaded, `image did not load: ${JSON.stringify(info)}`).toBe(true)
    expect(info?.src).toContain('file://')

    // The markdown itself must stay relative, or the folder stops being portable.
    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(1000)
    const saved = await readFile(file, 'utf8')
    expect(saved).toContain('(assets/pic.png)')
    expect(saved).not.toContain('file://')
  })
})
