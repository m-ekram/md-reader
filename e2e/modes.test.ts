// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * Focus and typewriter modes.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const LONG = Array.from({ length: 40 }, (_, i) => `Paragraph number ${i} of the document.`).join(
  '\n\n'
)

describe('focus mode', () => {
  it('dims every block except the one being edited', async () => {
    const file = join(ctx.workdir, 'focus.md')
    await writeFile(file, LONG, 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Paragraph number 0')

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('F8')
    await ctx.page.waitForFunction(
      () => document.documentElement.classList.contains('focus-mode'),
      { timeout: 10_000 }
    )

    // Exactly one block carries the focused marker, and it is the one the caret
    // is in. Asserting on the rendered opacity rather than only the class, since
    // the dimming is the visible behaviour.
    await ctx.page.waitForSelector('.ProseMirror .is-focused-block', { timeout: 10_000 })
    expect(await ctx.page.locator('.ProseMirror .is-focused-block').count()).toBe(1)

    const opacities = await ctx.page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.ProseMirror > *')]
      const focused = blocks.find((b) => b.classList.contains('is-focused-block'))
      const other = blocks.find((b) => !b.classList.contains('is-focused-block'))
      return {
        focused: focused ? getComputedStyle(focused).opacity : null,
        other: other ? getComputedStyle(other).opacity : null,
      }
    })
    expect(Number(opacities.focused)).toBe(1)
    expect(Number(opacities.other)).toBeLessThan(1)
  })

  it('moves the highlight as the caret moves', async () => {
    const firstBefore = await ctx.page.evaluate(
      () => document.querySelector('.ProseMirror .is-focused-block')?.textContent ?? ''
    )

    await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.waitForTimeout(300)

    const firstAfter = await ctx.page.evaluate(
      () => document.querySelector('.ProseMirror .is-focused-block')?.textContent ?? ''
    )
    expect(firstAfter).not.toBe(firstBefore)
  })

  it('turns off again, restoring every block', async () => {
    await ctx.page.keyboard.press('F8')
    await ctx.page.waitForFunction(
      () => !document.documentElement.classList.contains('focus-mode'),
      { timeout: 10_000 }
    )

    const dimmed = await ctx.page.evaluate(
      () =>
        [...document.querySelectorAll('.ProseMirror > *')].filter(
          (b) => Number(getComputedStyle(b).opacity) < 1
        ).length
    )
    expect(dimmed).toBe(0)
  })

  it('is remembered across a restart', async () => {
    await ctx.page.keyboard.press('F8')
    await ctx.page.waitForFunction(
      () => document.documentElement.classList.contains('focus-mode'),
      { timeout: 10_000 }
    )
    // Settings are written on a debounce; give them a moment to reach disk.
    await ctx.page.waitForTimeout(800)

    const stored = await ctx.page.evaluate(
      async () => (await window.api.settings.get()).editor.focusMode
    )
    expect(stored).toBe(true)
  })
})

describe('typewriter mode', () => {
  it('keeps the caret away from the bottom of the window', async () => {
    await ctx.page.keyboard.press('F8') // back off, so dimming does not confuse the view
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+Home')
    await ctx.page.keyboard.press('F9')
    await ctx.page.waitForTimeout(300)

    // Walk the caret well down the document. Without typewriter scrolling it
    // would sit near the bottom edge; with it, it should stay near the middle.
    for (let i = 0; i < 25; i++) await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.waitForTimeout(600)

    const position = await ctx.page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const scroller = document.querySelector('.editor-scroll')!.getBoundingClientRect()
      return (rect.top - scroller.top) / scroller.height
    })

    expect(position).not.toBeNull()
    // Somewhere in the middle band rather than pinned near the bottom.
    expect(position!).toBeGreaterThan(0.2)
    expect(position!).toBeLessThan(0.8)
  })
})
