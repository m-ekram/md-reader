// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newDocument, useApp, waitForText } from './helpers'

/**
 * More than one window.
 *
 * Crash recovery is offered as a window starts. Untitled documents were
 * journalled under a counter that restarted in every window, and every window
 * asked for everything journalled, so File > New Window offered the first
 * window's live, unsaved work as "recovered" — and choosing Discard deleted
 * its only protection against a crash.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

interface DialogCall {
  message: string
}

/** Records every message box main shows, answering each with its first button. */
async function recordDialogs(): Promise<void> {
  await ctx.app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __calls: DialogCall[] }
    g.__calls = []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as { message?: string }
      g.__calls.push({ message: opts?.message ?? '' })
      return { response: 0, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  })
}

const dialogCalls = () =>
  ctx.app.evaluate(() => (globalThis as unknown as { __calls: DialogCall[] }).__calls ?? [])

/** Whether the second window has booted: its app is up with a document in it. */
const secondWindowReady = () =>
  ctx.app.evaluate(async ({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    if (wins.length < 2) return false
    const newest = wins.reduce((a, b) => (a.id > b.id ? a : b))
    try {
      return await newest.webContents.executeJavaScript(
        '!!document.querySelector(".app") && !!document.querySelector(".ProseMirror")'
      )
    } catch {
      return false
    }
  })

/** Whether the second window has finished offering (or not offering) recovery. */
const secondWindowCheckedRecovery = () =>
  ctx.app.evaluate(async ({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    const newest = wins.reduce((a, b) => (a.id > b.id ? a : b))
    try {
      return await newest.webContents.executeJavaScript(
        'globalThis.__startupMarks?.recoveryChecked !== undefined'
      )
    } catch {
      return false
    }
  })

describe('a second window', () => {
  it('does not offer the first window’s live work as recovered', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('Live work in the first window.')
    await waitForText(ctx, 'Live work in the first window.')
    // Wait until the work is journalled on disk, where a second window would
    // find it: otherwise this could pass only because it was not written yet.
    const journalDir = join(ctx.workdir, 'userdata', 'journal')
    const journalled = async () => {
      const files = await readdir(journalDir).catch(() => [] as string[])
      for (const f of files) {
        const text = await readFile(join(journalDir, f), 'utf8').catch(() => '')
        if (text.includes('Live work in the first window.')) return true
      }
      return false
    }
    await expect.poll(journalled, { timeout: 10_000 }).toBe(true)

    await recordDialogs()
    await ctx.page.keyboard.press('Control+Shift+N')
    await expect.poll(secondWindowReady, { timeout: 30_000 }).toBe(true)

    // The new window marks when it has finished deciding what to recover, so
    // "no question was asked" is read after the decision, not after a guess.
    await expect.poll(secondWindowCheckedRecovery, { timeout: 15_000 }).toBe(true)
    const offered = (await dialogCalls()).filter((c) =>
      c.message.includes('Unsaved changes were recovered')
    )
    expect(offered, 'the new window offered another window’s live work').toEqual([])

    // And the first window still has its work.
    await waitForText(ctx, 'Live work in the first window.')
  }, 90_000)
})
