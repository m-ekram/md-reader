// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * The question asked when unsaved work is found after a crash.
 *
 * Escape, or the dialog's close button, answers a message box with its cancel
 * button. That was Discard, so dismissing the question deleted the very work
 * it was offering back. Its own suite: a second crash within half a minute is
 * treated as a crash loop, so a suite gets one.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

interface DialogCall {
  message: string
  detail?: string
  buttons?: string[]
  cancelId?: number
}

/** Records every message box, and answers each as Escape would: with its cancel button. */
async function dismissEveryDialog(): Promise<void> {
  await ctx.app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __dialogCalls: DialogCall[] }
    g.__dialogCalls = []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as DialogCall
      g.__dialogCalls.push({
        message: String(opts.message),
        detail: opts.detail,
        buttons: opts.buttons,
        cancelId: opts.cancelId,
      })
      return { response: opts.cancelId ?? 0, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  })
}

const dialogCalls = (): Promise<DialogCall[]> =>
  ctx.app.evaluate(
    () => (globalThis as unknown as { __dialogCalls?: DialogCall[] }).__dialogCalls ?? []
  )

/** Runs in the reloaded window, observed from main: a crashed page is dead to Playwright. */
function inWindow<T>(script: string): Promise<T | null> {
  return ctx.app.evaluate(async ({ BrowserWindow }, js) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents
    if (!wc || wc.isCrashed()) return null
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
    try {
      return await Promise.race([wc.executeJavaScript(js), timeout])
    } catch {
      return null
    }
  }, script) as Promise<T | null>
}

describe('recovered work after a crash', () => {
  it('is kept when the question is dismissed', async () => {
    const file = join(ctx.workdir, 'kept.md')
    await writeFile(file, 'On disk.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'On disk.')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' Only in the journal.')

    const journalDir = join(ctx.workdir, 'userdata', 'journal')
    const journalled = async () => {
      for (const f of await readdir(journalDir).catch(() => [] as string[])) {
        const text = await readFile(join(journalDir, f), 'utf8').catch(() => '')
        if (text.includes('Only in the journal.')) return true
      }
      return false
    }
    await expect.poll(journalled, { timeout: 10_000 }).toBe(true)

    await dismissEveryDialog()
    await ctx.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer()
    })

    // Asked, and dismissed.
    await expect
      .poll(
        async () =>
          (await dialogCalls()).some((c) => c.message.includes('Unsaved changes were recovered')),
        { timeout: 30_000 }
      )
      .toBe(true)
    await expect
      .poll(() => inWindow<boolean>('globalThis.__startupMarks?.recoveryChecked !== undefined'), {
        timeout: 15_000,
      })
      .toBe(true)

    // Dismissing is not discarding: the work is still there to be offered again.
    expect(await journalled(), 'dismissing the question deleted the recovered work').toBe(true)
  }, 90_000)
})
