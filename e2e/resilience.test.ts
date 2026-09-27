// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { chmod, mkdir, readdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openFile, useApp, waitForText } from './helpers'

/**
 * What happens when things go wrong: a save that fails, a file changed
 * underneath, a tab closed with unsaved work, a renderer that dies.
 *
 * Native dialogs cannot be driven from the page, so `dialog.showMessageBox` is
 * replaced in the main process with a recorder. It answers by matching the
 * message, and every call is kept so the test can assert on what the user was
 * actually told.
 *
 * Several of these were found by writing this suite: saving or closing straight
 * after typing acted on text without the last keystrokes, the tab's × button
 * discarded unsaved work without asking, and a file merely touched by another
 * program raised a prompt whose default button threw the edits away.
 *
 * Order matters in one respect: the standalone-file tests run before a
 * workspace is opened, because the watcher covers only the workspace folder.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

interface DialogCall {
  type?: string
  message: string
  detail?: string
  buttons?: string[]
}

/** Replaces the dialog; `answers` maps a message substring to a button index. */
async function recordDialogs(answers: Array<[string, number]> = []): Promise<void> {
  await ctx.app.evaluate(({ dialog }, rules) => {
    const g = globalThis as unknown as { __dialogCalls: DialogCall[] }
    g.__dialogCalls = []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as DialogCall
      g.__dialogCalls.push({
        type: opts.type,
        message: String(opts.message),
        detail: opts.detail,
        buttons: opts.buttons,
      })
      const rule = rules.find(([needle]) => String(opts.message).includes(needle))
      return { response: rule ? rule[1] : 0, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, answers)
}

function dialogCalls(): Promise<DialogCall[]> {
  return ctx.app.evaluate(
    () => (globalThis as unknown as { __dialogCalls: DialogCall[] }).__dialogCalls ?? []
  )
}

async function findCall(needle: string): Promise<DialogCall | undefined> {
  return (await dialogCalls()).find((c) => c.message.includes(needle))
}

const activeTabIsDirty = (): Promise<number> =>
  ctx.page.locator('.tab__select[aria-selected="true"] .tab__dot').count()

const tabNames = (): Promise<string[]> => ctx.page.locator('.tab__name').allInnerTexts()

/** Opens a fresh file and appends text, leaving the caret at the end. */
async function openAndEdit(path: string, original: string, addition: string): Promise<void> {
  await writeFile(path, original, 'utf8')
  await openFile(ctx, path)
  await waitForText(ctx, original.trim())
  await ctx.page.locator('.ProseMirror').click()
  await ctx.page.keyboard.press('Control+End')
  await ctx.page.keyboard.type(addition)
}

describe('saving straight after typing', () => {
  it('writes the last keystrokes', async () => {
    // No pause between typing and saving: the editor reports changes on a
    // debounce, and a save that read the store directly missed everything
    // typed inside that window.
    const file = join(ctx.workdir, 'fast.md')
    await openAndEdit(file, 'Start.\n', ' LASTWORDS')
    await ctx.page.keyboard.press('Control+s')

    await expect.poll(() => readFile(file, 'utf8'), { timeout: 10_000 }).toContain('LASTWORDS')
    await expect.poll(activeTabIsDirty, { timeout: 5000 }).toBe(0)
  })
})

describe('opening a file that ends in a list', () => {
  /**
   * The editor appends an empty paragraph after a final list, code block,
   * table or quote. It serialized as an extra newline, so such a file became
   * "edited" by being opened: a prompt to save on close, and a rewrite on
   * save. Found when a source-mode test failed only under load, which is when
   * the editor's report won the race against the switch to source mode.
   */
  const ORIGINAL = '# Notes\n\nA paragraph.\n\n- first\n- second\n'
  const file = () => join(ctx.workdir, 'ends-in-list.md')

  it('leaves it unedited, even after clicking into it', async () => {
    await writeFile(file(), ORIGINAL, 'utf8')
    await openFile(ctx, file())
    await waitForText(ctx, 'A paragraph')
    await ctx.page.locator('.ProseMirror').click()

    // Past the editor's reporting debounce, so a spurious edit would show.
    await ctx.page.waitForTimeout(1200)
    expect(await ctx.page.title()).not.toMatch(/^•/)
  })

  it('saves it byte for byte', async () => {
    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(800)
    expect(await readFile(file(), 'utf8')).toBe(ORIGINAL)
  })
})

describe('copying as markdown straight after typing', () => {
  it('includes the last keystrokes', async () => {
    // By accelerator, which can fire inside the editor's reporting debounce; a
    // menu click is too slow to reach it.
    await openAndEdit(join(ctx.workdir, 'copy.md'), 'Copied text.\n', ' TAILWORDS')
    await ctx.page.keyboard.press('Control+Shift+C')

    // Read from main: the renderer's clipboard API needs a permission prompt.
    await expect
      .poll(() => ctx.app.evaluate(({ clipboard }) => clipboard.readText()), { timeout: 5000 })
      .toContain('TAILWORDS')
  })
})

// Windows only. A read-only file there makes the save's rename over it fail,
// which is the failure this reports. On Linux a rename over a read-only file
// succeeds, so there is no failure to report and the save goes through. The
// second test saves what the first left unsaved, so they skip together.
describe.skipIf(process.platform !== 'win32')('a save that fails', () => {
  const file = () => join(ctx.workdir, 'readonly.md')

  it('says so, instead of appearing to succeed', async () => {
    await openAndEdit(file(), 'The original text.\n', ' An edit that cannot be written.')

    // On Windows this sets the read-only attribute, which the atomic rename
    // over the original then refuses.
    await chmod(file(), 0o444)
    try {
      await recordDialogs()
      await ctx.page.keyboard.press('Control+s')

      await expect.poll(() => findCall('was not saved'), { timeout: 10_000 }).toBeTruthy()
      const report = (await findCall('was not saved'))!
      expect(report.type).toBe('error')
      expect(report.message).toContain('readonly.md')
      // The explanation, not the raw EPERM text about a temporary file.
      expect(report.detail).toMatch(/read-only/i)
      expect(report.detail).not.toContain('.tmp')
      // The first fear after a failed save is that the work went with it.
      expect(report.detail).toMatch(/not been lost/)

      expect(await activeTabIsDirty()).toBeGreaterThan(0)
      expect(await readFile(file(), 'utf8')).toBe('The original text.\n')
    } finally {
      await chmod(file(), 0o644)
    }
  })

  it('saves normally once the file is writable again', async () => {
    await recordDialogs()
    await ctx.page.keyboard.press('Control+s')

    await expect.poll(() => readFile(file(), 'utf8'), { timeout: 10_000 }).toContain('An edit that')
    expect(await findCall('was not saved')).toBeUndefined()
  })
})

describe('saving over a file another program changed', () => {
  /**
   * A standalone file, outside any workspace: the watcher does not cover it,
   * so the check at save time is the only thing standing between the user's
   * save and someone else's work.
   */
  const file = () => join(ctx.workdir, 'shared.md')

  it('asks first, in words that fit, and Cancel keeps both', async () => {
    await openAndEdit(file(), 'Our starting point.\n', ' Our addition.')
    // Someone else writes the file in the meantime.
    await writeFile(file(), 'Their rewrite.\n', 'utf8')

    await recordDialogs([['has changed on disk', 1]])
    await ctx.page.keyboard.press('Control+s')

    await expect.poll(() => findCall('has changed on disk'), { timeout: 10_000 }).toBeTruthy()
    const prompt = (await findCall('has changed on disk'))!
    expect(prompt.buttons).toEqual(['Overwrite', 'Cancel'])
    // The close dialog's wording, which this replaced, said declining would
    // lose the user's changes. Declining here loses nothing.
    expect(prompt.detail).not.toMatch(/will be lost/)

    await ctx.page.waitForTimeout(300)
    expect(await readFile(file(), 'utf8')).toBe('Their rewrite.\n')
    expect(await activeTabIsDirty()).toBeGreaterThan(0)
  })

  it('replaces their version only when told to', async () => {
    await recordDialogs([['has changed on disk', 0]])
    await ctx.page.keyboard.press('Control+s')
    await expect.poll(() => readFile(file(), 'utf8'), { timeout: 10_000 }).toContain('Our addition')
  })

  it('notices a replacement that carries an older timestamp', async () => {
    // Sync clients and backup restores put back a file with its original,
    // older time. The check asked only "is it newer?", so this was missed and
    // the save overwrote their version without a word.
    const older = join(ctx.workdir, 'restored.md')
    await openAndEdit(older, 'Our starting point.\n', ' Our addition.')
    await writeFile(older, 'Restored from a backup.\n', 'utf8')
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    await utimes(older, anHourAgo, anHourAgo)

    await recordDialogs([['has changed on disk', 1]])
    await ctx.page.keyboard.press('Control+s')

    await expect.poll(() => findCall('has changed on disk'), { timeout: 10_000 }).toBeTruthy()
    expect(await readFile(older, 'utf8')).toBe('Restored from a backup.\n')
  })
})

describe('saving while another program reads the file', () => {
  /**
   * On Windows, renaming over a file that any other process has open fails.
   * Sync clients, antivirus, the search indexer and Explorer's preview pane
   * all open files briefly, so a single rename attempt turned routine activity
   * into a failed save. Found by this suite, whose own polling of a file made a
   * save fail about two times in three.
   */
  it('still saves', async () => {
    const file = join(ctx.workdir, 'contended.md')
    await openAndEdit(file, 'Before.\n', ' Written while being read.')

    // Another program repeatedly opening the file briefly, as a sync client or
    // scanner does: a read, then a short pause with the file released. A loop
    // with no pause would hold the file continuously, which is not the claim.
    let reading = true
    const reader = (async () => {
      while (reading) {
        await readFile(file).catch(() => {})
        await new Promise((r) => setTimeout(r, 15))
      }
    })()

    await recordDialogs()
    await ctx.page.keyboard.press('Control+s')
    await ctx.page.waitForTimeout(2500)
    reading = false
    await reader

    expect(await findCall('was not saved'), 'a brief hold must not fail the save').toBeUndefined()
    expect(await readFile(file, 'utf8')).toContain('Written while being read')
  })
})

describe('closing a tab with unsaved work', () => {
  it('asks before the × button discards it', async () => {
    const file = join(ctx.workdir, 'closing.md')
    await openAndEdit(file, 'Kept open.\n', ' Unsaved words.')
    await expect.poll(activeTabIsDirty, { timeout: 5000 }).toBeGreaterThan(0)

    // Cancel is the third button.
    await recordDialogs([['Save changes to', 2]])
    await ctx.page.locator('.tab__close[aria-label="Close closing.md"]').click()

    await expect.poll(() => findCall('Save changes to'), { timeout: 5000 }).toBeTruthy()
    expect(await tabNames()).toContain('closing.md')
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('Unsaved words')
  })

  it('asks even when the tab is closed straight after typing', async () => {
    // A clean document, then a keystroke and an immediate close: the dirty
    // check read the store, which had not caught up, and closed silently.
    const file = join(ctx.workdir, 'quick-close.md')
    await writeFile(file, 'Clean so far.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Clean so far')
    expect(await activeTabIsDirty()).toBe(0)

    await recordDialogs([['Save changes to', 2]])
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' x')
    await ctx.page.locator('.tab__close[aria-label="Close quick-close.md"]').click()

    await expect.poll(() => findCall('Save changes to'), { timeout: 5000 }).toBeTruthy()
    expect(await tabNames()).toContain('quick-close.md')
  })

  it('closes without asking when there is nothing unsaved', async () => {
    const file = join(ctx.workdir, 'clean.md')
    await writeFile(file, 'Nothing to lose.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Nothing to lose')

    await recordDialogs()
    await ctx.page.locator('.tab__close[aria-label="Close clean.md"]').click()

    await expect.poll(tabNames, { timeout: 5000 }).not.toContain('clean.md')
    expect(await dialogCalls()).toEqual([])
  })
})

describe('a file in the workspace touched by another program', () => {
  const folder = () => join(ctx.workdir, 'ws')
  const file = () => join(folder(), 'touched.md')

  it('does not interrupt when only the timestamp changed', async () => {
    await mkdir(folder(), { recursive: true })
    await writeFile(file(), 'Content nobody else changes.\n', 'utf8')
    await ctx.page.evaluate((root) => window.api.workspace.set(root), folder())

    await openFile(ctx, file())
    await waitForText(ctx, 'Content nobody else changes')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' My unsaved addition.')
    await expect.poll(activeTabIsDirty, { timeout: 5000 }).toBeGreaterThan(0)

    await recordDialogs()
    // A touch: same bytes, new timestamp.
    const later = new Date(Date.now() + 5000)
    await utimes(file(), later, later)

    // Long enough for the watcher's stability wait and debounce to have fired;
    // the next test proves the watcher is live, so this silence is meaningful.
    await ctx.page.waitForTimeout(2500)
    expect(await dialogCalls(), 'no prompt for a file that did not change').toEqual([])
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('My unsaved addition')
  })

  it('asks when the content really changed, and keeping your version is the default', async () => {
    await recordDialogs()
    await writeFile(file(), 'Someone else rewrote this.\n', 'utf8')

    await expect
      .poll(() => findCall('changed by another program'), { timeout: 15_000 })
      .toBeTruthy()
    const prompt = (await findCall('changed by another program'))!
    // The recorder answers with button 0, which is what Enter does: it has to
    // be the choice that loses nothing.
    expect(prompt.buttons?.[0]).toBe('Keep My Version')

    await ctx.page.waitForTimeout(500)
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('My unsaved addition')
  })
})

describe('a renderer that crashes', () => {
  /**
   * Observed from main. Playwright marks a crashed page dead for good, so the
   * reloaded window is not reachable through the old page object — and main is
   * where the recovery behaviour lives anyway.
   */
  function inWindow<T>(script: string): Promise<T | null> {
    return ctx.app.evaluate(async ({ BrowserWindow }, js) => {
      const wc = BrowserWindow.getAllWindows()[0]?.webContents
      if (!wc || wc.isCrashed()) return null
      // Raced against a timeout: executeJavaScript waits indefinitely on a page
      // that is not running script yet, and a hung poll reports nothing useful.
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
      try {
        return await Promise.race([wc.executeJavaScript(js), timeout])
      } catch {
        return null
      }
    }, script) as Promise<T | null>
  }

  it('comes back, and offers the unsaved work', async () => {
    const file = join(ctx.workdir, 'crash.md')
    await openAndEdit(file, 'Saved before the crash.\n', ' Typed but never saved.')
    await expect.poll(activeTabIsDirty, { timeout: 5000 }).toBeGreaterThan(0)
    // Journalling is fire-and-forget from the renderer. Wait until the text is
    // journalled on disk: a fixed 500 ms wait here failed under the load of a
    // full run, when the crash came before the journal had reached main.
    const journalDir = join(ctx.workdir, 'userdata', 'journal')
    await expect
      .poll(
        async () => {
          for (const f of await readdir(journalDir).catch(() => [] as string[])) {
            const text = await readFile(join(journalDir, f), 'utf8').catch(() => '')
            if (text.includes('Typed but never saved.')) return true
          }
          return false
        },
        { timeout: 10_000 }
      )
      .toBe(true)

    await recordDialogs([['Unsaved changes were recovered', 0]])
    await ctx.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer()
    })

    // The window booted again rather than staying blank.
    await expect
      .poll(() => inWindow<boolean>('!!document.querySelector(".app")'), { timeout: 30_000 })
      .toBe(true)

    // Every document with unsaved work is offered back, not only this one, and
    // in an order set by the journal's hashed filenames. So the assertion is
    // that *this* file was offered — found by name — not that it came first.
    await expect
      .poll(
        async () =>
          (await dialogCalls()).some(
            (c) =>
              c.message.includes('Unsaved changes were recovered') && c.detail?.includes('crash.md')
          ),
        { timeout: 20_000 }
      )
      .toBe(true)

    // Restored, and on screen once its tab is chosen — not merely offered.
    //
    // Chosen again on every poll. Each restored document becomes the active
    // tab, and the others may still be being restored when this one's tab
    // appears: a choice made then is taken over by the next. A user cannot hit
    // that, since each recovery prompt is modal; a test answering them
    // instantly can, and did on Linux, where the journal's hashed order put
    // another document after this one.
    const showCrashTab = `(() => {
      const name = [...document.querySelectorAll('.tab__name')].find((e) => e.textContent === 'crash.md')
      name?.closest('button')?.click()
      return document.querySelector(".ProseMirror")?.innerText ?? ""
    })()`
    await expect
      .poll(() => inWindow<string>(showCrashTab), { timeout: 15_000 })
      .toContain('Typed but never saved')
  }, 90_000)
})
