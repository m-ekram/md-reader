// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chooseMenu, newDocument, openFile, startDocument, useApp, waitForText } from './helpers'

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

  it('has no application menu, whose hidden accelerators zoomed the whole page', async () => {
    // Electron's default menu bound Ctrl+Plus, Ctrl+Minus and Ctrl+0 to a
    // whole-page zoom. A key pressed through Playwright goes straight into the
    // page and never reaches a native menu, so pressing those keys here passes
    // with the menu present; proven by putting it back. The menu is checked.
    expect(await ctx.app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true)
  })

  it('keeps the chosen size across a restart', async () => {
    const before = await docFontSize()
    await ctx.page.getByRole('button', { name: 'Larger text' }).click()
    // Changed on screen first: a size that is stored and never applied reads
    // the same before and after a reload.
    await expect.poll(docFontSize, { timeout: 5000 }).toBe(before + 1)
    const chosen = await docFontSize()

    await ctx.page.reload()
    await startDocument(ctx)
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
    await startDocument(ctx)
    await expect.poll(columnMaxWidth, { timeout: 15_000 }).toBe('none')
  })

  it('takes a width in pixels from the slider', async () => {
    await openPreferences()
    await ctx.page.getByRole('combobox', { name: 'Content width' }).selectOption('custom')
    await ctx.page.getByRole('slider', { name: 'Content width in pixels' }).fill('700')
    await expect.poll(columnMaxWidth, { timeout: 5000 }).toBe('700px')

    // The width the text gets, not the column's box. Crepe's own 120 px of
    // padding each side once took 240 px of every width while the column's
    // max-width read exactly as set; only the gutter for the block handle
    // may remain. Compared with the column as laid out, not the setting: a
    // window a pixel too narrow for 700 px lays the column out at 699.
    const { column, text } = await ctx.page.evaluate(() => {
      const editor = document.querySelector('.milkdown .ProseMirror') as HTMLElement
      const cs = getComputedStyle(editor)
      return {
        column: parseFloat(getComputedStyle(document.querySelector('.editor-host')!).width),
        text:
          editor.getBoundingClientRect().width -
          parseFloat(cs.paddingLeft) -
          parseFloat(cs.paddingRight),
      }
    })
    expect(column, 'the 700 px column is laid out near its width').toBeGreaterThan(650)
    expect(text, `${column} px column, ${text} px of text`).toBeGreaterThanOrEqual(column - 72)

    await ctx.page.getByRole('combobox', { name: 'Content width' }).selectOption('theme')
    await expect.poll(columnMaxWidth, { timeout: 5000 }).not.toBe('700px')
    await ctx.page.keyboard.press('Escape')
  })
})

describe('block menu', () => {
  beforeEach(async () => {
    // A failure above can leave Preferences open over the document, and these
    // would then fail on a covered paragraph rather than on the menu.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.waitForSelector('.prefs__panel', { state: 'detached', timeout: 5000 })
  })

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
  it('cap a long name, with the full path in the tooltip', async () => {
    const name = 'a-rather-long-file-name-that-would-crowd-the-tab-bar.md'
    const file = join(ctx.workdir, name)
    await writeFile(file, '# Long\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Long')

    const seen = await ctx.page.evaluate((n) => {
      const bar = document.querySelector('.tabs')!
      const tabs = [...bar.querySelectorAll('.tab')]
      const tab = tabs.find((t) => t.querySelector('.tab__name')?.textContent === n)!
      const label = tab.querySelector('.tab__name')!
      return {
        width: tab.getBoundingClientRect().width,
        truncated: label.scrollWidth > label.clientWidth,
        title: tab.querySelector('.tab__select')!.getAttribute('title') ?? '',
        used: tabs.reduce((sum, t) => sum + t.getBoundingClientRect().width, 0),
        room: bar.clientWidth,
      }
    }, name)
    // The bar has room to spare, so nothing but the cap can be narrowing the
    // tab. With many tabs open they shrink regardless, which is why this
    // test once passed with the cap removed.
    expect(seen.used, 'the tab bar is too crowded to show the cap').toBeLessThan(seen.room - 200)
    expect(seen.width).toBeLessThanOrEqual(160)
    expect(seen.truncated).toBe(true)
    // The whole name, with its folder in front of it.
    expect(seen.title.endsWith(name)).toBe(true)
    expect(seen.title.length).toBeGreaterThan(name.length)
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
    // Highlighting arrives after the text: the language is loaded on demand.
    // Read before it, the keyword's span did not exist yet.
    await ctx.page.waitForFunction(
      () => {
        const block = document.querySelector('.milkdown-code-block')
        return (
          !!block?.querySelector('.cm-activeLineGutter') &&
          [...block.querySelectorAll('.cm-line span')].some((s) => s.textContent === 'const')
        )
      },
      null,
      { timeout: 15_000 }
    )

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

describe('toolbar', () => {
  const bar = () => ctx.page.locator('.milkdown-top-bar').first()

  it('is hidden until View > Toolbar shows it, and hides again', async () => {
    const file = join(ctx.workdir, 'toolbar.md')
    await writeFile(file, 'Make this bold please.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Make this bold please.')

    expect(await bar().isVisible()).toBe(false)
    await chooseMenu(ctx, 'View', 'Toolbar')
    await expect.poll(() => bar().isVisible(), { timeout: 5000 }).toBe(true)
    await chooseMenu(ctx, 'View', 'Toolbar')
    await expect.poll(() => bar().isVisible(), { timeout: 5000 }).toBe(false)
  })

  it('formats with a labelled button, block math included', async () => {
    await chooseMenu(ctx, 'View', 'Toolbar')
    await expect.poll(() => bar().isVisible(), { timeout: 5000 }).toBe(true)

    // Every button says what it does: they are icons only.
    const titles = await bar()
      .locator('.top-bar-item')
      .evaluateAll((els) => els.map((e) => e.getAttribute('title')))
    expect(titles).toEqual([
      'Bold',
      'Italic',
      'Strikethrough',
      'Inline code',
      'Bullet list',
      'Numbered list',
      'Task list',
      'Link',
      'Image',
      'Table',
      'Code block',
      // Left out while the menus refused block math, which the editor models.
      'Math',
      'Quote',
      'Horizontal rule',
    ])

    // The label is the behaviour: "Bold" makes bold.
    // The document is that one line: select all of it, as a user would.
    await ctx.page.locator('.ProseMirror p', { hasText: 'Make this bold please.' }).click()
    await ctx.page.keyboard.press('Control+a')
    await expect
      .poll(() => ctx.page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toContain('Make this bold please.')
    await bar().locator('.top-bar-item[title="Bold"]').click()
    await expect
      .poll(() => ctx.page.locator('.ProseMirror strong').count(), { timeout: 5000 })
      .toBeGreaterThan(0)

    await chooseMenu(ctx, 'View', 'Toolbar')
  })
})
