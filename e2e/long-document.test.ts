// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * A long document, where most of the text is off screen.
 *
 * Reaching text that is off screen is what these check: jumping to a far
 * heading, finding a match near the end, going to the end, and the page
 * staying still while typing. Find selected a far match and counted it, but
 * never showed it. And letting Chromium skip laying out off-screen blocks
 * (content-visibility) halved keystroke latency at 10,000 lines, but broke the
 * heading jump and Ctrl+End, so it was not kept: these tests are what caught it.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const PARTS = 150

function longDocument(): string {
  const out: string[] = []
  for (let n = 1; n <= PARTS; n++) {
    out.push(`## Part ${n}`, '')
    out.push(`Opening paragraph of part ${n}, with enough words to wrap across the column.`, '')
    out.push(`- a point in part ${n}`, '- another point', '')
    out.push(`> A quoted line in part ${n}.`, '')
    if (n === PARTS - 2) out.push('The zebracorn is mentioned exactly once, near the end.', '')
    out.push(`Closing paragraph of part ${n}.`, '')
  }
  out.push('The very last line.')
  return out.join('\n') + '\n'
}

/** Whether an element is inside the editor's visible area. */
function inView(selector: string, text?: string): Promise<boolean> {
  return ctx.page.evaluate(
    ([sel, t]) => {
      const pane = document.querySelector('.editor-scroll')!.getBoundingClientRect()
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find(
        (e) => t === undefined || (e.textContent ?? '').includes(t)
      )
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.bottom > pane.top && r.top < pane.bottom && r.height > 0
    },
    [selector, text] as const
  )
}

describe('a long document', () => {
  it('opens', async () => {
    const file = join(ctx.workdir, 'long.md')
    await writeFile(file, longDocument(), 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'The very last line.')
  })

  it('scrolls to a far heading from the Outline', async () => {
    await ctx.page.evaluate(() =>
      window.api.settings.patch({ sidebar: { visible: true, width: 280, panel: 'outline' } })
    )
    const last = ctx.page.locator('.outline__item', {
      hasText: new RegExp(`^\\s*Part ${PARTS}\\s*$`),
    })
    await last.waitFor({ state: 'visible', timeout: 15_000 })
    await last.click()
    await expect
      .poll(() => inView('.ProseMirror h2', `Part ${PARTS}`), { timeout: 10_000 })
      .toBe(true)
  })

  it('finds a match near the end and shows it', async () => {
    await ctx.page.locator('.ProseMirror h2').first().scrollIntoViewIfNeeded()
    await ctx.page.locator('.ProseMirror p').first().click()
    await ctx.page.keyboard.press('Control+f')
    await ctx.page.waitForSelector('.find__input', { state: 'visible', timeout: 10_000 })
    await ctx.page.locator('.find__input').first().fill('zebracorn')
    await ctx.page.keyboard.press('Enter')
    await expect
      .poll(() => inView('.ProseMirror-active-search-match'), { timeout: 10_000 })
      .toBe(true)
    await ctx.page.keyboard.press('Escape')
  })

  it('goes to the end with Ctrl+End, and what is typed lands there', async () => {
    await ctx.page.locator('.ProseMirror p').first().click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' Appended.')
    await waitForText(ctx, 'The very last line. Appended.')
    await expect
      .poll(() => inView('.ProseMirror p', 'The very last line. Appended.'), { timeout: 10_000 })
      .toBe(true)
  })

  it('keeps the page still while typing in the middle', async () => {
    const middle = `Closing paragraph of part ${PARTS / 2}.`
    const para = ctx.page.locator('.ProseMirror p', { hasText: middle })
    await para.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await para.click()
    await ctx.page.keyboard.press('End')
    const top = () => para.evaluate((el) => el.getBoundingClientRect().top)
    const before = await top()
    await ctx.page.keyboard.type(' Still here.')
    await waitForText(ctx, `${middle} Still here.`)
    // Blocks above keep their measured heights, so nothing shifts under the caret.
    expect(Math.abs((await top()) - before)).toBeLessThan(4)
  })
})

describe('typing in a long document', () => {
  it('stays responsive: the median keystroke paints within 100 ms', async () => {
    // A guard against a large regression, not a benchmark: typing here takes
    // about 30 ms a key on a desktop, and npm run bench:typing measures it
    // properly. 4,000 lines stays under the size where source mode is offered.
    const lines: string[] = []
    for (let n = 1; lines.length < 4000; n++) {
      lines.push(`## Section ${n}`, '', `Prose for section ${n}, with *emphasis* and \`code\`.`, '')
      lines.push(`- a point`, `- another point`, '', `> A quote in section ${n}.`, '')
    }
    const file = join(ctx.workdir, 'typing.md')
    await writeFile(file, lines.join('\n') + '\nEnd of the typing document.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'End of the typing document.')

    const middle = ctx.page.locator('.ProseMirror > p').nth(400)
    await middle.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await middle.click()
    await ctx.page.keyboard.press('End')
    await ctx.page.evaluate(() => {
      const w = window as unknown as { __latency: number[] }
      w.__latency = []
      document.addEventListener(
        'keydown',
        () => {
          const t = performance.now()
          requestAnimationFrame(() => setTimeout(() => w.__latency.push(performance.now() - t), 0))
        },
        true
      )
    })
    for (const ch of ' steady typing here') {
      await ctx.page.keyboard.type(ch)
      // A typist's pace, so each keystroke is measured on its own.
      await ctx.page.waitForTimeout(120)
    }
    const latency = await ctx.page.evaluate(
      () => (window as unknown as { __latency: number[] }).__latency
    )
    const median = [...latency].sort((a, b) => a - b)[Math.floor(latency.length / 2)]
    expect(latency.length).toBeGreaterThan(10)
    expect(median, `median keystroke ${median.toFixed(1)} ms`).toBeLessThan(100)
  }, 120_000)
})
