// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useApp } from './helpers'

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
