// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chooseMenu, newDocument, nextFrames, openFile, useApp, waitForText } from './helpers'

/**
 * Text size, column width, the chrome and the block menu, asserted on what is
 * rendered: a computed size, a measured height, a painted colour.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

/** The document's rendered text size, in px. */
function docFontSize(): Promise<number> {
  return ctx.page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.ProseMirror p')!).fontSize)
  )
}

/** The column's computed max-width. */
function columnMaxWidth(): Promise<string> {
  return ctx.page.evaluate(() => getComputedStyle(document.querySelector('.editor-host')!).maxWidth)
}

/** Heights of the title bar and the tab bar, in px. */
function chromeHeights(): Promise<{ title: number; tabs: number }> {
  return ctx.page.evaluate(() => ({
    title: document.querySelector('.titlebar')!.getBoundingClientRect().height,
    tabs: document.querySelector('.tabs')!.getBoundingClientRect().height,
  }))
}

/** Chromium's page zoom, which must never move: zoom is the document's alone. */
function pageZoomLevel(): Promise<number> {
  return ctx.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()
  )
}

async function openPreferences(): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.keyboard.press('Control+,')
  await ctx.page.waitForSelector('.prefs__panel', { state: 'visible', timeout: 10_000 })
}

describe('text size', () => {
  it('opens two documents, so the tab bar shows', async () => {
    const file = join(ctx.workdir, 'sized.md')
    await writeFile(file, '# Sized\n\nA paragraph to measure.\n\nAnother one.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'A paragraph to measure.')
    await newDocument(ctx)
    // By name: the launch's blank document holds the first tab.
    await ctx.page.locator('.tab__select', { hasText: 'sized.md' }).click()
    await waitForText(ctx, 'A paragraph to measure.')
  })

  it('grows the document text from the status bar, and not the chrome', async () => {
    const before = await docFontSize()
    const chrome = await chromeHeights()

    const larger = ctx.page.getByRole('button', { name: 'Larger text' })
    await larger.click()
    await larger.click()
    await expect.poll(docFontSize, { timeout: 5000 }).toBe(before + 2)
    await expect(ctx.page.locator('.size__value').textContent()).resolves.toContain(
      `${before + 2}px`
    )

    expect(await chromeHeights()).toEqual(chrome)
    expect(await pageZoomLevel()).toBe(0)
  })

  it('steps with View ▸ Zoom and returns with Actual Size', async () => {
    const start = await docFontSize()
    await chooseMenu(ctx, 'View', 'Zoom Out')
    await expect.poll(docFontSize, { timeout: 5000 }).toBe(start - 1)

    await chooseMenu(ctx, 'View', 'Actual Size')
    // Back to the theme's size, whatever the steps before.
    await expect.poll(docFontSize, { timeout: 5000 }).toBe(start - 2)
    expect(await pageZoomLevel()).toBe(0)
  })

  it('takes Ctrl+wheel as a text size change, not a page zoom', async () => {
    const start = await docFontSize()
    const chrome = await chromeHeights()
    await ctx.page.locator('.ProseMirror p').first().hover()
    await ctx.page.keyboard.down('Control')
    try {
      await ctx.page.mouse.wheel(0, -100)
    } finally {
      await ctx.page.keyboard.up('Control')
    }
    await expect.poll(docFontSize, { timeout: 5000 }).toBe(start + 1)
    expect(await chromeHeights()).toEqual(chrome)
    expect(await pageZoomLevel()).toBe(0)
  })

  it('leaves the page zoom alone on the keys a browser zooms with', async () => {
    // Electron's default menu bound Ctrl+Plus, which on this layout is
    // Ctrl+Shift+=: the app's own Zoom In, and a whole-page zoom on top of it.
    await ctx.page.locator('.ProseMirror p').first().click()
    await ctx.page.keyboard.press('Control+Shift+=')
    await ctx.page.keyboard.press('Control+=')
    await nextFrames(ctx)
    expect(await pageZoomLevel()).toBe(0)

    // Ctrl+= made the paragraph a heading, which is the app's; undo it.
    await ctx.page.keyboard.press('Control+z')
    await waitForText(ctx, 'A paragraph to measure.')

    await chooseMenu(ctx, 'View', 'Actual Size')
  })

  it('keeps the chosen size across a restart', async () => {
    await ctx.page.getByRole('button', { name: 'Larger text' }).click()
    const chosen = await docFontSize()

    await ctx.page.reload()
    await ctx.page.waitForSelector('.ProseMirror', { timeout: 30_000 })
    await expect.poll(docFontSize, { timeout: 15_000 }).toBe(chosen)

    await chooseMenu(ctx, 'View', 'Actual Size')
  })
})

describe('content width', () => {
  it('fills the pane on Full width, and remembers it', async () => {
    expect(await columnMaxWidth()).not.toBe('none')

    await openPreferences()
    await ctx.page.getByRole('combobox', { name: 'Content width' }).selectOption('full')
    await expect.poll(columnMaxWidth, { timeout: 5000 }).toBe('none')
    await ctx.page.keyboard.press('Escape')

    // Text still keeps off the window edge.
    const padding = await ctx.page.evaluate(
      () => getComputedStyle(document.querySelector('.editor-host')!).paddingLeft
    )
    expect(parseFloat(padding)).toBeGreaterThan(0)

    await ctx.page.reload()
    await ctx.page.waitForSelector('.ProseMirror', { timeout: 30_000 })
    await expect.poll(columnMaxWidth, { timeout: 15_000 }).toBe('none')
  })

  it('takes a width in pixels from the slider', async () => {
    await openPreferences()
    await ctx.page.getByRole('combobox', { name: 'Content width' }).selectOption('custom')
    await ctx.page.getByRole('slider', { name: 'Content width in pixels' }).fill('1000')
    await expect.poll(columnMaxWidth, { timeout: 5000 }).toBe('1000px')

    await ctx.page.getByRole('combobox', { name: 'Content width' }).selectOption('theme')
    await expect.poll(columnMaxWidth, { timeout: 5000 }).not.toBe('1000px')
    await ctx.page.keyboard.press('Escape')
  })
})

describe('block menu', () => {
  it('has a half-transparent background, not none', async () => {
    await ctx.page.locator('.ProseMirror p').first().hover()
    await ctx.page.waitForSelector('.milkdown-block-handle', { state: 'visible', timeout: 5000 })
    await ctx.page.locator('.milkdown-block-handle .operation-item').first().click()
    await ctx.page.waitForSelector('.milkdown-slash-menu', { state: 'visible', timeout: 5000 })

    const bg = await ctx.page.evaluate(
      () => getComputedStyle(document.querySelector('.milkdown-slash-menu')!).backgroundColor
    )
    // color-mix() serialises as color(srgb r g b / a); a plain rgba() also parses.
    const alpha = Number(
      bg.match(/\/\s*([\d.]+)\s*\)$/)?.[1] ?? bg.match(/rgba\([^)]*,\s*([\d.]+)\)$/)?.[1] ?? 1
    )
    expect(bg, `menu background is ${bg}`).not.toBe('rgba(0, 0, 0, 0)')
    expect(alpha, `menu background is ${bg}`).toBeCloseTo(0.5, 1)
    await ctx.page.keyboard.press('Escape')
  })

  it('names the drag handle, which otherwise looks like a dead button', async () => {
    await ctx.page.locator('.ProseMirror p').first().hover()
    const handle = ctx.page.locator('.milkdown-block-handle .operation-item').nth(1)
    await expect
      .poll(() => handle.getAttribute('title'), { timeout: 5000 })
      .toBe('Drag to move this block')
  })
})

describe('tabs', () => {
  it('stay compact when many are open, with the full name in the tooltip', async () => {
    const long = 'a-rather-long-file-name-that-would-crowd-the-tab-bar'
    for (let i = 0; i < 6; i++) {
      const file = join(ctx.workdir, `${long}-${i}.md`)
      await writeFile(file, `# Tab ${i}\n`, 'utf8')
      await openFile(ctx, file)
      await waitForText(ctx, `Tab ${i}`)
    }

    const tabs = await ctx.page.locator('.tabs .tab').evaluateAll((els) =>
      els.map((el) => ({
        width: el.getBoundingClientRect().width,
        title: el.querySelector('.tab__select')?.getAttribute('title') ?? '',
      }))
    )
    expect(tabs.length).toBeGreaterThanOrEqual(6)
    for (const t of tabs) expect(t.width).toBeLessThanOrEqual(160)
    expect(tabs.some((t) => t.title.endsWith(`${long}-5.md`))).toBe(true)
  })
})

describe('quotes and alerts', () => {
  it('draws one bar on a quote, and an alert label on one line', async () => {
    const file = join(ctx.workdir, 'quotes.md')
    await writeFile(file, '> A plain quote.\n\n> [!NOTE]\n> An alert.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'An alert.')

    const shape = await ctx.page.evaluate(() => {
      const quote = document.querySelector('.ProseMirror blockquote:not([data-alert])')!
      const alert = document.querySelector('.ProseMirror blockquote[data-alert]')!
      const label = getComputedStyle(alert, '::before')
      return {
        quoteBar: getComputedStyle(quote, '::before').content,
        labelWidth: parseFloat(label.width),
        labelHeight: parseFloat(label.height),
        labelLine: parseFloat(label.lineHeight) || parseFloat(label.fontSize) * 1.6,
      }
    })
    // The theme's border is the bar; Crepe's own would be a second one.
    expect(shape.quoteBar).toBe('none')
    // "NOTE" on one line, not stacked a letter per line in a 4 px column.
    expect(shape.labelWidth).toBeGreaterThan(20)
    expect(shape.labelHeight).toBeLessThan(shape.labelLine * 1.5)
  })
})

describe('code blocks', () => {
  it('take their colours from the theme, not a fixed dark palette', async () => {
    const file = join(ctx.workdir, 'code.md')
    await writeFile(file, '```js\nconst answer = 42\n```\n', 'utf8')
    await openFile(ctx, file)
    await ctx.page.waitForSelector('.milkdown-code-block .cm-content', { timeout: 15_000 })

    const seen = await ctx.page.evaluate(() => {
      // What a token resolves to under the theme in force.
      const resolve = (token: string): string => {
        const probe = document.createElement('span')
        probe.style.color = `var(${token})`
        document.body.appendChild(probe)
        const c = getComputedStyle(probe).color
        probe.remove()
        return c
      }
      const block = document.querySelector('.milkdown-code-block')!
      const keyword = [...block.querySelectorAll('.cm-line span')].find(
        (s) => s.textContent === 'const'
      )!
      return {
        text: getComputedStyle(block.querySelector('.cm-content')!).color,
        codeFg: resolve('--code-fg'),
        // The active line's number cell, which is drawn whether or not the
        // block has focus.
        activeGutter: getComputedStyle(block.querySelector('.cm-activeLineGutter')!)
          .backgroundColor,
        keyword: getComputedStyle(keyword).color,
        keywordToken: resolve('--syntax-keyword'),
      }
    })
    // Plain code was One Dark's pale grey on a light page.
    expect(seen.text).toBe(seen.codeFg)
    // The line number sat on a dark box.
    expect(seen.activeGutter).toBe('rgba(0, 0, 0, 0)')
    expect(seen.keyword).toBe(seen.keywordToken)
  })
})
