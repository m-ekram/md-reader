// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newDocument, openFile, useApp } from './helpers'

/**
 * Colours as they reach the screen, in every built-in theme.
 *
 * Themes redefine tokens, and a token a theme forgets to redefine keeps the
 * contract's default, which was chosen for some other background. That is how
 * the sidebar's hover came to be white on a white sidebar in five themes.
 * Measured from computed styles, composited over what is behind them, and
 * compared by WCAG contrast ratio.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const THEMES = [
  'github',
  'night',
  'claude-light',
  'newsprint',
  'pixyll',
  'whitey',
  'nord',
  'one-dark',
  'sepia',
  'gruvbox-dark',
]

type Rgba = [number, number, number, number]

/** Parses `rgb()`, `rgba()` and `color(srgb …)`, as computed styles give them. */
function parse(css: string): Rgba {
  const srgb = css.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/)
  if (srgb) {
    const [r, g, b] = [srgb[1], srgb[2], srgb[3]].map((v) => Number(v) * 255)
    return [r, g, b, srgb[4] === undefined ? 1 : Number(srgb[4])]
  }
  const rgb = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
  if (!rgb) throw new Error(`unparsed colour: ${css}`)
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
}

/** `top` painted over an opaque `below`. */
function over(top: Rgba, below: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + below[i] * (1 - a)).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

async function useTheme(id: string): Promise<void> {
  await ctx.page.evaluate((t) => window.api.settings.patch({ theme: t }), id)
  await expect
    .poll(() => ctx.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe(id)
}

describe('native controls', () => {
  it('are dark in dark themes and light in light ones', async () => {
    // Scrollbars, drop-down lists and checkboxes are drawn by the browser in
    // the system colours, which follow `color-scheme`. It was never set, so
    // dark themes had light scrollbars and light drop-down lists.
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      const { canvas, page } = await ctx.page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.cssText = 'background: Canvas; color: var(--doc-bg)'
        document.body.appendChild(probe)
        const s = getComputedStyle(probe)
        const out = { canvas: s.backgroundColor, page: s.color }
        probe.remove()
        return out
      })
      const dark = (c: string) => luminance(parse(c)) < 0.18
      if (dark(canvas) !== dark(page)) failures.push(`${theme}: page ${page}, controls ${canvas}`)
    }
    expect(failures, 'native controls do not match the page').toEqual([])
  })
})

describe('menus', () => {
  it('show shortcuts readably, in every theme', async () => {
    // Shortcuts were painted in the disabled colour, about 2:1, so an enabled
    // item's shortcut looked greyed out.
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      await ctx.page.keyboard.press('Escape')
      await ctx.page.locator('.menubar__top', { hasText: /^File$/ }).click()
      const accel = ctx.page
        .locator('.menu__item:not(.is-disabled) .menu__accel:not(:empty)')
        .first()
      await accel.waitFor({ state: 'visible' })
      const { fg, bg } = await accel.evaluate((el) => ({
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(el.closest('.menu')!).backgroundColor,
      }))
      const base = parse(bg)
      const ratio = contrast(over(parse(fg), base), base)
      if (ratio < 4.5) failures.push(`${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}`)
      await ctx.page.keyboard.press('Escape')
    }
    expect(failures, 'shortcut text below 4.5:1').toEqual([])
  })
})

describe('marks that carry meaning', () => {
  it('show an unsaved tab, in every theme', async () => {
    // The dot was the document's accent colour, which suits the page, not the
    // tab strip: at 1.7:1 on Newsprint's.
    await newDocument(ctx)
    await ctx.page.keyboard.type('Unsaved words.')
    await newDocument(ctx)
    const dot = ctx.page.locator('.tab:not(.is-active) .tab__dot').first()
    await dot.waitFor()
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      const { fg, bg } = await dot.evaluate((el) => ({
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(el.closest('.tabs')!).backgroundColor,
      }))
      const ratio = contrast(parse(fg), parse(bg))
      if (ratio < 3) failures.push(`${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}`)
    }
    expect(failures, 'unsaved dot below 3:1').toEqual([])
  })

  it('show which find options are on, in every theme', async () => {
    // White on the accent: in dark themes the accent is light, and the
    // lettering all but vanished.
    await ctx.page.keyboard.press('Control+f')
    await ctx.page.locator('.find__opt', { hasText: 'Aa' }).click()
    const on = ctx.page.locator('.find__opt.is-on').first()
    await on.waitFor()
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      const { fg, bg, bar } = await on.evaluate((el) => ({
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(el).backgroundColor,
        bar: getComputedStyle(el.closest('.find')!).backgroundColor,
      }))
      // The option's tint is painted over the find bar.
      const ground = over(parse(bg), parse(bar))
      const ratio = contrast(over(parse(fg), ground), ground)
      if (ratio < 4.5) failures.push(`${theme}: ${fg} on ${bg} over ${bar} = ${ratio.toFixed(2)}`)
    }
    await ctx.page.locator('.find__opt', { hasText: 'Aa' }).click()
    await ctx.page.keyboard.press('Escape')
    expect(failures, 'toggle lettering below 4.5:1').toEqual([])
  })
})

describe('alerts', () => {
  it('label every kind readably, in every theme', async () => {
    // Tip and Important had fixed colours chosen for a white page.
    const kinds = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']
    const file = join(ctx.workdir, 'alerts.md')
    const markdown = kinds.map((k) => `> [!${k}]\n> ${k.toLowerCase()} text`).join('\n\n')
    await writeFile(file, `${markdown}\n`, 'utf8')
    await openFile(ctx, file)
    await ctx.page.locator('.ProseMirror blockquote[data-alert="caution"]').waitFor()
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      const labels = await ctx.page.evaluate(() =>
        [...document.querySelectorAll('.ProseMirror blockquote[data-alert]')].map((el) => ({
          kind: el.getAttribute('data-alert'),
          fg: getComputedStyle(el, '::before').color,
          bg: getComputedStyle(el).backgroundColor,
          page: getComputedStyle(el.closest('.editor-scroll')!).backgroundColor,
        }))
      )
      for (const { kind, fg, bg, page } of labels) {
        const ground = over(parse(bg), parse(page))
        const ratio = contrast(parse(fg), ground)
        if (ratio < 4.5) failures.push(`${theme} ${kind}: ${fg} = ${ratio.toFixed(2)}`)
      }
    }
    expect(failures, 'alert labels below 4.5:1').toEqual([])
  })
})

describe('the application’s own text', () => {
  it('keeps its own font, whatever the document’s', async () => {
    // Everything inherited the document's font, so menus, tabs and the status
    // bar turned serif in Sepia, Newsprint and Pixyll.
    const file = join(ctx.workdir, 'fonts.md')
    await writeFile(file, 'Body text.\n', 'utf8')
    await openFile(ctx, file)
    await ctx.page.locator('.ProseMirror p', { hasText: 'Body text.' }).waitFor()
    const failures: string[] = []
    for (const theme of ['sepia', 'newsprint', 'pixyll']) {
      await useTheme(theme)
      const fonts = await ctx.page.evaluate(() => ({
        menu: getComputedStyle(document.querySelector('.menubar__top')!).fontFamily,
        status: getComputedStyle(document.querySelector('.status')!).fontFamily,
        page: getComputedStyle(document.querySelector('.ProseMirror p')!).fontFamily,
      }))
      if (!/\bserif\b/.test(fonts.page.replace(/sans-serif/g, '')))
        failures.push(`${theme}: the document lost its serif (${fonts.page})`)
      for (const [where, family] of [
        ['menu', fonts.menu],
        ['status', fonts.status],
      ] as const) {
        if (family === fonts.page)
          failures.push(`${theme}: the ${where} uses the document's font (${family})`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('the chrome’s text', () => {
  it('reads at 4.5:1, in every theme', async () => {
    // Tab names, the window title, the status bar and search results' line
    // numbers were dimmed, several by opacity, below 4.5:1 in some themes.
    // Two documents, so there is an inactive tab; before the search, which a
    // new document's editor taking focus would otherwise leave behind.
    await newDocument(ctx)
    await newDocument(ctx)
    const dir = join(ctx.workdir, 'search-here')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'hay.md'), 'needle in the hay\n', 'utf8')
    await ctx.page.evaluate((root) => window.api.workspace.set(root), dir)
    await ctx.page.evaluate(() =>
      window.api.settings.patch({ sidebar: { visible: true, width: 260, panel: 'search' } })
    )
    await ctx.page.locator('.search__input').fill('needle')
    await ctx.page.locator('.results__hit').first().waitFor({ timeout: 15_000 })

    const targets = {
      'inactive tab': '.tab:not(.is-active) .tab__name',
      'window title': '.titlebar__title',
      'status bar': '.status__right',
      'search line number': '.results__line',
    }
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      for (const [what, selector] of Object.entries(targets)) {
        const result = await ctx.page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          // The colour on screen, opacity included, over the first opaque
          // background behind it.
          let opacity = 1
          let bg = 'rgba(0, 0, 0, 0)'
          for (let n: Element | null = el; n; n = n.parentElement) {
            const s = getComputedStyle(n)
            opacity *= Number(s.opacity)
            if (bg === 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'rgba(0, 0, 0, 0)')
              bg = s.backgroundColor
          }
          return { fg: getComputedStyle(el).color, bg, opacity }
        }, selector)
        if (!result) {
          failures.push(`${theme}: no ${what}`)
          continue
        }
        const base = parse(result.bg)
        const fg = parse(result.fg)
        const ratio = contrast(over([fg[0], fg[1], fg[2], fg[3] * result.opacity], base), base)
        if (ratio < 4.5) failures.push(`${theme} ${what}: ${ratio.toFixed(2)}`)
      }
    }
    expect(failures, 'chrome text below 4.5:1').toEqual([])
  })
})

describe('the sidebar', () => {
  it('shows where the pointer is, in every theme', async () => {
    await ctx.page.evaluate(() =>
      window.api.settings.patch({ sidebar: { visible: true, width: 260, panel: 'outline' } })
    )
    const tab = ctx.page.locator('.sidebar__tab:not(.is-active)').first()
    const failures: string[] = []
    for (const theme of THEMES) {
      await useTheme(theme)
      await tab.hover()
      const { hover, ground } = await tab.evaluate((el) => ({
        hover: getComputedStyle(el).backgroundColor,
        ground: getComputedStyle(el.closest('.sidebar')!).backgroundColor,
      }))
      const base = parse(ground)
      const ratio = contrast(over(parse(hover), base), base)
      // Faint is fine; invisible is not.
      if (ratio < 1.08) failures.push(`${theme}: hover ${hover} on ${ground} = ${ratio.toFixed(3)}`)
      await ctx.page.mouse.move(0, 0)
    }
    expect(failures, 'hover indistinguishable from the sidebar').toEqual([])
  })
})
