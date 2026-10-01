// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchTarget, openFile, useApp, waitForText } from './helpers'

/**
 * Opening a file while the app is already running, as a double-click in
 * Explorer does: the second launch hands the file to the first and exits, and
 * the file opens there, in a tab of its own.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

/** Starts the app again on the same profile, as Windows would, and waits for it to exit. */
function launchAgain(file: string): Promise<number | null> {
  const target = launchTarget([`--user-data-dir=${join(ctx.workdir, 'userdata')}`, file])
  // The development Electron's path is what `require('electron')` gives in Node.
  const exe = target.executablePath ?? (createRequire(import.meta.url)('electron') as string)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  env.EKRAM_NO_UPDATES = '1'
  return new Promise((resolve, reject) => {
    const child = spawn(exe, target.args, { cwd: process.cwd(), env, stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('the second launch did not exit: it did not find the first'))
    }, 30_000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.on('error', reject)
  })
}

describe('a second launch with a file', () => {
  it('opens the file in a new tab of the running app, and exits', async () => {
    // A file already being worked on, so the new one has to take a tab of its own.
    const first = join(ctx.workdir, 'already-open.md')
    await writeFile(first, '# Already open\n', 'utf8')
    await openFile(ctx, first)
    await waitForText(ctx, 'Already open')

    const file = join(ctx.workdir, 'from-explorer.md')
    await writeFile(file, '# Double-clicked\n\nOpened from Explorer.\n', 'utf8')
    expect(await launchAgain(file)).toBe(0)

    await waitForText(ctx, 'Opened from Explorer.')
    const tabs = ctx.page.locator('.tab__select')
    await expect
      .poll(() => tabs.allInnerTexts())
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining('already-open.md'),
          expect.stringContaining('from-explorer.md'),
        ])
      )
    expect(await ctx.page.locator('.tab__select[aria-selected="true"]').innerText()).toContain(
      'from-explorer.md'
    )
    // One window: the file came to this one, not a new one.
    expect(
      await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    ).toBe(1)
  })
})
