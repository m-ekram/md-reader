// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { nextFrames, noticeTexts, useApp } from './helpers'

/**
 * The Help menu.
 *
 * Topics are markdown files opened in the editor itself, so these assert that
 * the document renders — not merely that a tab appeared. A help file that
 * opened blank would satisfy a tab-count check perfectly.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

async function chooseHelp(label: string): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.locator('.menubar__top', { hasText: /^Help$/ }).click()
  await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
  await ctx.page
    .locator('.menu[role="menu"] .menu__item')
    // Several labels end in an ellipsis, so it is allowed for rather than
    // written into every call site.
    .filter({ has: ctx.page.locator('.menu__label', { hasText: new RegExp(`^${label}…?$`) }) })
    .first()
    .click()
  await ctx.page.waitForTimeout(800)
}

const body = (): Promise<string> => ctx.page.locator('.ProseMirror').innerText()

describe('help topics', () => {
  it('opens Quick Start as a rendered document', async () => {
    await chooseHelp('Quick Start')

    await expect.poll(body, { timeout: 15_000 }).toContain('Quick Start')
    // Rendered, not raw: the heading is an element and the table is a table.
    expect(await ctx.page.locator('.ProseMirror h1').count()).toBeGreaterThan(0)
    expect(await ctx.page.locator('.ProseMirror table td').count()).toBeGreaterThan(0)
  })

  it('names the tab after the topic', async () => {
    const tabs = await ctx.page.locator('.tab__select').allInnerTexts()
    expect(tabs.some((t) => t.includes('Quick Start'))).toBe(true)
  })

  it('opens it readonly, so a stray keystroke cannot edit it', async () => {
    const before = await body()
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('XXXX')
    await ctx.page.waitForTimeout(500)
    expect(await body()).toBe(before)
  })

  it('cannot be changed by commands either', async () => {
    // Readonly stopped typing, but not commands: they change the document
    // directly, and a shortcut made the help page a heading or bold, and
    // then asked whether to save it.
    const before = await body()
    const h1s = await ctx.page.locator('.ProseMirror h1').count()
    await ctx.page.locator('.ProseMirror p').first().click()
    await ctx.page.keyboard.press('Control+a')
    await ctx.page.keyboard.press('Control+b')
    await ctx.page.keyboard.press('Control+1')
    await ctx.page.keyboard.press('Control+Shift+q')
    await nextFrames(ctx)
    expect(await body()).toBe(before)
    expect(await ctx.page.locator('.ProseMirror h1').count()).toBe(h1s)
    expect(await ctx.page.locator('.ProseMirror blockquote').count()).toBe(0)
    // Nothing to save, because nothing changed.
    expect(await ctx.page.locator('.titlebar__title').innerText()).not.toMatch(/^•/)

    // And the menu says so, rather than offering what will not happen.
    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.menubar__top', { hasText: /^Format$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    const strong = ctx.page.locator('.menu__item', { hasText: /^Strong/ }).first()
    expect(await strong.getAttribute('aria-disabled')).toBe('true')
    await ctx.page.keyboard.press('Escape')
  })

  it('stays readonly shown as source', async () => {
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.cm-content', { state: 'visible', timeout: 15_000 })
    const before = await ctx.page.locator('.cm-content').innerText()
    await ctx.page.locator('.cm-content').click()
    await ctx.page.keyboard.type('XXXX')
    await nextFrames(ctx)
    expect(await ctx.page.locator('.cm-content').innerText()).toBe(before)

    await ctx.page.keyboard.press('Control+/')
    await ctx.page.waitForSelector('.ProseMirror', { state: 'visible', timeout: 15_000 })
  })

  it('brings the same tab forward rather than opening a second copy', async () => {
    const before = await ctx.page.locator('.tab__select').count()
    await chooseHelp('Quick Start')
    expect(await ctx.page.locator('.tab__select').count()).toBe(before)
  })

  it('opens the Markdown Reference, including its code samples', async () => {
    await chooseHelp('Markdown Reference')
    await expect.poll(body, { timeout: 15_000 }).toContain('Markdown Reference')
    await ctx.page.waitForSelector('.milkdown-code-block', { timeout: 15_000 })
  })

  it('opens every remaining topic', async () => {
    const topics: Array<[string, string]> = [
      ["What's New", 'What'],
      ['Custom Themes', 'Custom Themes'],
      ['Use Images', 'Use Images'],
      ['More Topics', 'More Topics'],
      ['Credits', 'Credits'],
      ['Change Log', 'Change Log'],
    ]
    for (const [label, expected] of topics) {
      await chooseHelp(label)
      await expect.poll(body, { timeout: 15_000 }).toContain(expected)
    }
  })
})

describe('the menus', () => {
  it('leaves no item saying "Not available yet"', async () => {
    // Every menu item is now either implemented or greyed with a stated
    // reason. The placeholder tooltip means one was missed.
    const menus = ['File', 'Edit', 'Paragraph', 'Format', 'View', 'Themes', 'Help']
    for (const menu of menus) {
      await ctx.page.keyboard.press('Escape')
      await ctx.page.locator('.menubar__top', { hasText: new RegExp(`^${menu}$`) }).click()
      await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })

      const stale = await ctx.page
        .locator('.menu[role="menu"] .menu__item[title="Not available yet"]')
        .count()
      expect(stale, `${menu} still has an unimplemented item`).toBe(0)
    }
    await ctx.page.keyboard.press('Escape')
  })
})

describe('About', () => {
  it('names the version, the author and the licence', async () => {
    await ctx.app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __about: { message: string; detail?: string }[] }
      g.__about = []
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const opts = (args.length > 1 ? args[1] : args[0]) as { message: string; detail?: string }
        g.__about.push({ message: String(opts.message), detail: opts.detail })
        return { response: 0, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
    })
    await chooseHelp('About')
    await expect
      .poll(() =>
        ctx.app.evaluate(
          () =>
            (globalThis as unknown as { __about: { message: string; detail?: string }[] }).__about
        )
      )
      .toEqual([
        {
          message: 'ekram.md',
          detail: expect.stringMatching(/Version 1\.0\.0[\s\S]*Muhammad Ekram[\s\S]*MIT/),
        },
      ])
  })
})

describe('Check Updates', () => {
  it('answers, here that this build does not update itself', async () => {
    // Not a packaged, installed app: what a development build or a test run says.
    await chooseHelp('Check Updates')
    await expect
      .poll(async () => (await noticeTexts(ctx)).join(' '))
      .toContain('Updates are checked in the installed app')
  })
})
