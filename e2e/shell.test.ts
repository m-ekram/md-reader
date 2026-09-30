// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  chooseMenu,
  newDocument,
  nextFrames,
  noticeTexts,
  openFile,
  useApp,
  waitForText,
} from './helpers'

/**
 * The application shell: window chrome, status bar, and a usable document on launch.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('application shell', () => {
  it('starts without console errors', () => {
    expect(ctx.consoleErrors).toEqual([])
  })

  it('renders the title bar and status bar', async () => {
    await expect(ctx.page.locator('.titlebar')).toBeTruthy()
    expect(await ctx.page.locator('.titlebar').count()).toBe(1)
    expect(await ctx.page.locator('.status').count()).toBe(1)
  })

  it('shows the logo in the title bar, drawn, with its page intact', async () => {
    // Read back from the image as drawn: loaded, and with the book's page
    // opaque. The first cut of the icon made the page transparent along with
    // the paper around it, which left a hole on every dark background.
    const logo = await ctx.page.evaluate(async () => {
      const img = document.querySelector('.titlebar__logo') as HTMLImageElement | null
      if (!img) return null
      if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true }))
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const g = canvas.getContext('2d')!
      g.drawImage(img, 0, 0)
      const alpha = (x: number, y: number) => g.getImageData(x, y, 1, 1).data[3]
      const w = img.naturalWidth
      return {
        width: w,
        shownWidth: img.getBoundingClientRect().width,
        corner: alpha(0, 0),
        // Inside the page, clear of its lines: right of centre, below the text.
        page: alpha(Math.round(w * 0.62), Math.round(w * 0.72)),
        markText: document.querySelector('.titlebar__mark')!.textContent!.trim(),
      }
    })
    expect(logo, 'no logo in the title bar').not.toBeNull()
    expect(logo!.width, 'the logo image did not load').toBeGreaterThan(0)
    expect(logo!.shownWidth).toBeGreaterThan(10)
    expect(logo!.corner, 'the paper around the mark should be transparent').toBe(0)
    expect(logo!.page, 'the book page should be opaque').toBe(255)
    expect(logo!.markText, 'the old "m" is still there').toBe('')
  })
})

describe.runIf(process.platform === 'win32')('Windows caption buttons', () => {
  /**
   * Windows' own, so hovering Maximize offers Snap Layouts, which buttons
   * drawn by the page never can. They sit over the page's title bar, so the
   * page leaves them room and paints them in the theme's colours.
   */
  it('are the system’s, over the title bar, with room left for them', async () => {
    const layout = await ctx.page.evaluate(() => {
      // Typed by hand: the DOM library this project builds against lacks it.
      const wco = (
        navigator as unknown as {
          windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect }
        }
      ).windowControlsOverlay
      const area = wco?.getTitlebarAreaRect()
      return {
        visible: wco?.visible ?? false,
        areaRight: area ? area.x + area.width : null,
        pageButtons: document.querySelectorAll('.titlebar__controls .cap').length,
        barRight: document.querySelector('.titlebar__drag')!.getBoundingClientRect().right,
      }
    })
    expect(layout.visible, 'no system caption buttons').toBe(true)
    expect(layout.pageButtons, 'the page draws its own as well').toBe(0)
    expect(layout.barRight).toBeLessThanOrEqual(layout.areaRight! + 0.5)
  })

  it('take the theme’s title bar colours, and change with it', async () => {
    await ctx.app.evaluate(({ BrowserWindow }) => {
      const g = globalThis as unknown as { __overlay: unknown[] }
      g.__overlay = []
      const original = BrowserWindow.prototype.setTitleBarOverlay
      BrowserWindow.prototype.setTitleBarOverlay = function (this: Electron.BrowserWindow, o) {
        g.__overlay.push(o)
        return original.call(this, o)
      }
    })
    const chrome = () =>
      ctx.page.evaluate(() => {
        const s = getComputedStyle(document.documentElement)
        return s.getPropertyValue('--chrome-bg').trim()
      })
    const last = () =>
      ctx.app.evaluate(() => {
        const calls = (globalThis as unknown as { __overlay: Array<{ color?: string }> }).__overlay
        return calls.at(-1)?.color ?? null
      })

    await chooseMenu(ctx, 'Themes', 'Sepia')
    await expect.poll(last).toBe(await chrome())
    await chooseMenu(ctx, 'Themes', 'Github')
    await expect.poll(last).toBe(await chrome())
  })
})

describe.skipIf(process.platform === 'win32')('caption buttons elsewhere', () => {
  it('are drawn by the page', async () => {
    expect(await ctx.page.locator('.titlebar__controls .cap').count()).toBe(3)
  })
})

describe('the command palette runs what it lists', () => {
  /**
   * Asserted by what the command did to the document, not by the palette
   * closing: a palette that opens, filters and dismisses without running
   * anything would pass every check made on the palette alone.
   */
  async function openPalette(): Promise<void> {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+Shift+P')
    await ctx.page.waitForSelector('.palette__panel', { state: 'visible' })
  }

  const items = () => ctx.page.locator('.palette__item')
  const firstLabel = () => items().first().locator('.palette__label').innerText()

  it('opens on Ctrl+Shift+P and filters as you type', async () => {
    await newDocument(ctx)

    await openPalette()
    const all = await items().count()
    expect(all).toBeGreaterThan(10)

    await ctx.page.keyboard.type('quote')
    await expect.poll(() => items().count()).toBeLessThan(all)
    expect(await items().count()).toBeGreaterThan(0)

    await ctx.page.keyboard.press('Escape')
    await expect.poll(() => ctx.page.locator('.palette__panel').count()).toBe(0)
  })

  it('shows where a command lives, so two "Image" items are distinguishable', async () => {
    await openPalette()
    await ctx.page.keyboard.type('heading 2')
    await expect.poll(firstLabel).toBe('Heading 2')
    expect(await items().first().locator('.palette__path').innerText()).toContain('Paragraph')
    await ctx.page.keyboard.press('Escape')
  })

  it('runs the selected command against the document', async () => {
    // newDocument clicks into the editor, which leaves the pointer in its
    // middle: where the palette opens. That is not incidental. It is how this
    // test caught a real bug, where a row appearing under the resting cursor
    // claimed the selection and Enter ran a command nobody had looked at.
    await newDocument(ctx)
    await ctx.page.keyboard.type('palette target')
    await waitForText(ctx, 'palette target')
    await ctx.page.keyboard.press('Control+a')

    await openPalette()
    await ctx.page.keyboard.type('quote')
    await expect.poll(firstLabel).toBe('Quote')

    // Asserted before Enter, so a selection that has drifted fails here and
    // names the cause, rather than failing later as a missing blockquote.
    expect(
      await items().first().getAttribute('aria-selected'),
      'the top row keeps the selection'
    ).toBe('true')

    await ctx.page.keyboard.press('Enter')
    await expect.poll(() => ctx.page.locator('.ProseMirror blockquote').count()).toBeGreaterThan(0)
  })

  it('leaves unavailable commands unrunnable rather than hiding the failure', async () => {
    // Table commands are disabled outside a table. The palette must not run one
    // on Enter, or it becomes a way around every enabled() guard in the app.
    await newDocument(ctx)
    await ctx.page.keyboard.type('not a table')
    await waitForText(ctx, 'not a table')

    await openPalette()
    await ctx.page.keyboard.type('add row above')
    const row = items().filter({ hasText: 'Add Row Above' }).first()
    await expect.poll(() => row.getAttribute('aria-disabled')).toBe('true')

    // Forced, because Playwright refuses to click something reporting
    // aria-disabled. That refusal is the affordance working; the force is what
    // gets past it to test the handler's own guard underneath.
    await row.click({ force: true })
    await nextFrames(ctx)
    // Still open, because choosing a disabled command does nothing at all.
    expect(await ctx.page.locator('.palette__panel').count()).toBe(1)
    await ctx.page.keyboard.press('Escape')
  })
})

describe('the right-click menu', () => {
  it('opens in the document with cut, copy and paste', async () => {
    // Native menus cannot be clicked from here, so the popup is recorded
    // instead of shown; what it would have shown is the assertion.
    await ctx.app.evaluate(({ Menu }) => {
      const g = globalThis as unknown as { __menu?: string[] }
      g.__menu = undefined
      Menu.prototype.popup = function (this: Electron.Menu) {
        g.__menu = this.items.map((i) => i.role ?? i.label)
      }
    })
    // The palette tests above can leave the palette open over the document.
    const palette = ctx.page.locator('.palette__panel')
    if (await palette.isVisible()) {
      await ctx.page.locator('.palette__panel input').first().press('Escape')
      await palette.waitFor({ state: 'detached', timeout: 5000 })
    }
    await newDocument(ctx)
    await ctx.page.keyboard.type('Some text to right-click')
    await ctx.page.locator('.ProseMirror p').first().click({ button: 'right' })

    await expect
      .poll(() =>
        ctx.app.evaluate(() => (globalThis as unknown as { __menu?: string[] }).__menu ?? null)
      )
      .toEqual(expect.arrayContaining(['cut', 'copy', 'paste', 'selectall']))
  })
})

describe('menus in a short window', () => {
  it('fit the window, scroll to their last item, and open submenus inside it', async () => {
    // A menu had no height limit: the Paragraph menu, some 890 px tall, ran
    // off the bottom of a smaller window, and its last items could not be
    // reached.
    await ctx.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.unmaximize()
      w.setSize(900, 400)
    })
    await expect.poll(() => ctx.page.evaluate(() => window.innerHeight)).toBeLessThan(420)

    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    const menu = ctx.page.locator('.menu[role="menu"]').first()
    await menu.waitFor()
    const inside = (box: { y: number; height: number } | null) =>
      ctx.page.evaluate(
        (b) => b !== null && b.y >= 0 && b.y + b.height <= window.innerHeight + 0.5,
        box
      )
    expect(await inside(await menu.boundingBox()), 'the menu runs off the window').toBe(true)

    const last = menu.locator(':scope > .menu__item').last()
    await last.scrollIntoViewIfNeeded()
    expect(await inside(await last.boundingBox()), 'the last item cannot be reached').toBe(true)

    await menu
      .locator('.menu__row--sub', { hasText: 'Table' })
      .locator('.menu__item')
      .first()
      .hover()
    const nested = ctx.page.locator('.menu--nested').first()
    await nested.waitFor()
    const box = await nested.boundingBox()
    expect(await inside(box), 'the submenu runs off the window').toBe(true)
    // Drawn where it is, not clipped away by the scrolling menu around it.
    const hit = await ctx.page.evaluate(
      (b) =>
        document
          .elementFromPoint(b!.x + b!.width / 2, b!.y + b!.height / 2)
          ?.closest('.menu--nested') !== null,
      box
    )
    expect(hit, 'the submenu is hidden behind or clipped by its menu').toBe(true)

    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Escape')
    await ctx.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1200, 820)
    )
  })
})

describe('many tabs', () => {
  it('keep the active one in view', async () => {
    // The strip scrolls sideways once it overflows, but nothing kept the
    // active tab in it: a new document's tab opened out of sight.
    for (let i = 0; i < 20; i++) {
      await ctx.page.keyboard.press('Escape')
      await ctx.page.keyboard.press('Control+n')
    }
    const inView = () =>
      ctx.page.evaluate(() => {
        const strip = document.querySelector('.tabs')!.getBoundingClientRect()
        const tab = document.querySelector('.tab.is-active')!.getBoundingClientRect()
        return tab.left >= strip.left - 0.5 && tab.right <= strip.right + 0.5
      })
    await expect.poll(inView, { message: 'the new tab is out of sight' }).toBe(true)

    // Round to the first.
    await ctx.page.keyboard.press('Control+Tab')
    await expect.poll(inView, { message: 'the first tab is out of sight' }).toBe(true)

    // And back the other way, round to the last: Ctrl+Tab only went forward.
    const activeIndex = () =>
      ctx.page.evaluate(() =>
        [...document.querySelectorAll('.tab')].findIndex((t) => t.classList.contains('is-active'))
      )
    const count = await ctx.page.locator('.tab').count()
    expect(await activeIndex()).toBe(0)
    await ctx.page.keyboard.press('Control+Shift+Tab')
    await expect.poll(activeIndex).toBe(count - 1)
    await expect.poll(inView, { message: 'the last tab is out of sight' }).toBe(true)
  })
})

describe('brief messages', () => {
  it('stack above the status bar without hiding it, and can be dismissed', async () => {
    // They shared the status bar's one slot with its lasting warnings: a second
    // message replaced the first before it could be read.
    await openFile(ctx, join(ctx.workdir, 'first-missing.md'))
    await openFile(ctx, join(ctx.workdir, 'second-missing.md'))
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '), { timeout: 10_000 })
      .toMatch(/first-missing\.md[\s\S]*second-missing\.md/)

    const status = (await ctx.page.locator('.status').boundingBox())!
    const notes = ctx.page.locator('.note')
    for (let i = 0; i < (await notes.count()); i++) {
      const box = (await notes.nth(i).boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(status.y)
      expect(box.x + box.width).toBeLessThanOrEqual(status.x + status.width)
    }

    await ctx.page.locator('.note').first().locator('.note__close').click()
    await expect.poll(async () => (await noticeTexts(ctx)).join(' ')).not.toContain('first-missing')
    expect((await noticeTexts(ctx)).join(' ')).toContain('second-missing')
  })
})

describe('dialogs give the focus back', () => {
  it('to the document, so typing goes on where it was', async () => {
    // Escape from the palette or Preferences left the focus on the page
    // itself: the next keystrokes went nowhere. (Open Quickly, which needs a
    // folder, shares the code; the workspace suite has one.)
    await newDocument(ctx)
    await ctx.page.keyboard.type('Before.')
    await waitForText(ctx, 'Before.')

    for (const open of ['Control+Shift+P', 'Control+,']) {
      await ctx.page.keyboard.press(open)
      await ctx.page.waitForSelector('.palette__panel, .quick__panel, .prefs__panel', {
        state: 'visible',
      })
      await ctx.page.keyboard.press('Escape')
      await ctx.page.waitForSelector('.palette__panel, .quick__panel, .prefs__panel', {
        state: 'detached',
      })
      await ctx.page.keyboard.type(' x')
    }
    // At the end, where the caret was: focusing the editor alone put it first.
    await waitForText(ctx, 'Before. x x')
  })

  it('and keep Tab inside while they are open', async () => {
    await ctx.page.keyboard.press('Control+,')
    await ctx.page.waitForSelector('.prefs__panel', { state: 'visible' })
    // Past every control in the dialog, and then some.
    for (let i = 0; i < 80; i++) await ctx.page.keyboard.press('Tab')
    expect(await ctx.page.evaluate(() => !!document.activeElement?.closest('.prefs__panel'))).toBe(
      true
    )
    await ctx.page.keyboard.press('Escape')
  })
})

describe('Alt and a letter', () => {
  // Read at once, not waited for: most of the time no menu is open.
  const openMenu = () =>
    ctx.page.evaluate(
      () =>
        document.querySelector('.menubar__root.is-open .menubar__top')?.textContent?.trim() ?? ''
    )

  it('opens the menu it names, as Windows menus do', async () => {
    // Alt alone reached the menu bar; Alt+F did nothing.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.ProseMirror').first().click()
    for (const [key, menu] of [
      ['f', 'File'],
      ['e', 'Edit'],
      ['p', 'Paragraph'],
      ['o', 'Format'],
      ['v', 'View'],
      ['t', 'Themes'],
      ['h', 'Help'],
    ]) {
      await ctx.page.keyboard.press(`Alt+${key}`)
      await expect.poll(openMenu).toBe(menu)
      await ctx.page.keyboard.press('Escape')
      await expect.poll(openMenu).toBe('')
    }
  })

  it('shows which letter while Alt is held', async () => {
    const underlined = () =>
      ctx.page
        .locator('.menubar__mnemonic')
        .evaluateAll(
          (els) =>
            els.filter((e) => getComputedStyle(e).textDecorationLine.includes('underline')).length
        )
    expect(await underlined()).toBe(0)
    await ctx.page.keyboard.down('Alt')
    await expect.poll(underlined).toBe(7)
    await ctx.page.keyboard.up('Alt')
    await expect.poll(underlined).toBe(0)
    await ctx.page.keyboard.press('Escape')
  })
})
