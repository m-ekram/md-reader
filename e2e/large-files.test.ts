// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { noticeTexts, openFile, useApp, waitForText } from './helpers'

/**
 * The large-document fallback.
 *
 * Phase 0 measured mounting the formatted view at roughly 0.3 ms per line, so a
 * 20 000-line file takes seconds to open and stays unpleasant afterwards. The
 * threshold has been a setting since Phase 4 and was read by nothing: stored,
 * configurable, and with no effect at all.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

/** A document of `n` lines, with a marker on the first so it can be found. */
function lines(n: number, marker: string): string {
  const body = Array.from({ length: n - 1 }, (_, i) => `Line ${i + 1} of the body.`)
  return [`# ${marker}`, ...body].join('\n')
}

const inSourceMode = (): Promise<number> => ctx.page.locator('.cm-content').count()

describe('automatic source mode', () => {
  it('opens an ordinary file in the formatted view', async () => {
    const file = join(ctx.workdir, 'small.md')
    await writeFile(file, lines(50, 'Small Document'), 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Small Document')

    expect(await ctx.page.locator('.ProseMirror h1').count()).toBeGreaterThan(0)
  })

  it('opens a document past the threshold in source mode', async () => {
    // Just over the 10 000-line default. Written rather than mocked, so this
    // exercises the same path a real file takes.
    const file = join(ctx.workdir, 'huge.md')
    await writeFile(file, lines(10_050, 'Huge Document'), 'utf8')
    await openFile(ctx, file)

    await expect.poll(inSourceMode, { timeout: 40_000 }).toBeGreaterThan(0)
    // The marker is in the text either way; what matters is which view holds it.
    expect(await ctx.page.locator('.editor-scroll.is-source').count()).toBe(1)
  }, 90_000)

  it('says why, and warns of nothing it has already avoided', async () => {
    // It opened in source view without a word, and the status bar went on
    // warning that typing may lag: true of the formatted view, not of this one.
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '))
      .toContain('opened in source view')
    expect(await ctx.page.locator('.status').innerText()).not.toContain('may lag')
  })

  it('offers the formatted view from the message', async () => {
    // Forced, not locked: the threshold picks the opening view and nothing more.
    await ctx.page
      .locator('.note', { hasText: 'opened in source view' })
      .getByRole('button', { name: 'Show Formatted' })
      .click()
    await expect
      .poll(() => ctx.page.locator('.ProseMirror').count(), { timeout: 40_000 })
      .toBeGreaterThan(0)
    // And, in the formatted view, now warns that it may lag.
    // Allowed as long as the switch: the page is busy laying out 10 000 lines.
    await expect
      .poll(() => ctx.page.locator('.status').innerText(), { timeout: 40_000 })
      .toContain('may lag')
  }, 90_000)
})

describe('a document past the warning line', () => {
  it('opens formatted, and the warning switches it to source view', async () => {
    // Between the two thresholds: it opens as it is, and the status bar says
    // typing may lag. The warning only said so; now it is the way out.
    const file = join(ctx.workdir, 'long.md')
    await writeFile(file, lines(6_000, 'Long Document'), 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Long Document', 40_000)

    await ctx.page
      .locator('.status')
      .getByRole('button', { name: /may lag/ })
      .click()
    await expect.poll(inSourceMode, { timeout: 40_000 }).toBeGreaterThan(0)
    expect(await ctx.page.locator('.status').innerText()).not.toContain('may lag')
  }, 90_000)
})
