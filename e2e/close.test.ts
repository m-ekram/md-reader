// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { newDocument, useApp, waitForText } from './helpers'

/**
 * Closing a window with unsaved work waits for the user's answer, however long
 * they take to give it.
 *
 * Main gave the page 4 s to reply to a close, and the page replies only after
 * the user has answered "Save changes?" — and any Save As that follows. So a
 * user who took longer than that to decide saw the window vanish from under
 * the question. The other suites answer dialogs instantly and never saw it.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

describe('closing with unsaved work', () => {
  it('keeps the window while the user is still deciding', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('Work the user has not saved.')
    await waitForText(ctx, 'Work the user has not saved.')

    // The question, answered as a slow user would: Cancel, five seconds on.
    await ctx.app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __asked: boolean; __answered: boolean }
      g.__asked = false
      g.__answered = false
      dialog.showMessageBox = (async () => {
        g.__asked = true
        // A stated wait, not a guess: this delay is the behaviour under test,
        // longer than the 4 s the page used to be given.
        await new Promise((r) => setTimeout(r, 5000))
        g.__answered = true
        return { response: 2, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
    })

    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())

    const state = () =>
      ctx.app.evaluate(({ BrowserWindow }) => {
        const g = globalThis as unknown as { __asked: boolean; __answered: boolean }
        return {
          asked: g.__asked,
          answered: g.__answered,
          windows: BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length,
        }
      })

    await expect.poll(async () => (await state()).asked, { timeout: 10_000 }).toBe(true)
    await expect.poll(async () => (await state()).answered, { timeout: 15_000 }).toBe(true)

    expect((await state()).windows, 'the window closed while the user was deciding').toBe(1)
    await waitForText(ctx, 'Work the user has not saved.')
  }, 60_000)
})
