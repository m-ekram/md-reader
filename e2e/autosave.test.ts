// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newDocument, noticeTexts, openFile, useApp, waitForText } from './helpers'

/**
 * Saving automatically: off unless switched on, and never at the cost of
 * another program's change or of a document that has no file yet.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

/** Longer than auto-save's pause, for asserting that a save did *not* happen. */
const PAST_THE_PAUSE_MS = 3000

const onDisk = (path: string) => readFile(path, 'utf8')

async function setAutoSave(on: boolean): Promise<void> {
  await ctx.page.evaluate((v) => window.api.settings.patch({ autoSave: v }), on)
}

/** Opens a fresh file and appends text, leaving the caret at the end. */
async function openAndEdit(path: string, original: string, addition: string): Promise<void> {
  await writeFile(path, original, 'utf8')
  await openFile(ctx, path)
  await waitForText(ctx, original.trim())
  await ctx.page.locator('.ProseMirror').click()
  await ctx.page.keyboard.press('Control+End')
  await ctx.page.keyboard.type(addition)
}

describe('auto-save', () => {
  it('is off unless switched on', async () => {
    const file = join(ctx.workdir, 'manual.md')
    await openAndEdit(file, 'Saved by hand.\n', ' Not yet.')
    await waitForText(ctx, 'Not yet.')

    // A duration, not a condition: this is waiting for something not to happen,
    // and auto-save would have happened within it.
    await ctx.page.waitForTimeout(PAST_THE_PAUSE_MS)
    expect(await onDisk(file)).toBe('Saved by hand.\n')

    // A save asked for says so, briefly.
    await ctx.page.keyboard.press('Control+s')
    await expect.poll(() => noticeTexts(ctx)).toContain('Saved manual.md')
  })

  it('saves a file a moment after typing stops', async () => {
    await setAutoSave(true)
    const file = join(ctx.workdir, 'auto.md')
    await openAndEdit(file, 'Saved already.\n', ' And typed after.')

    await expect.poll(() => onDisk(file), { timeout: 10_000 }).toContain('And typed after.')
    // Shown as saved: no unsaved-changes marker on its tab or title.
    await expect
      .poll(() => ctx.page.locator('.titlebar__title').innerText(), { timeout: 5000 })
      .not.toMatch(/^•/)
    // Quietly: a message after every pause in typing would be noise.
    expect((await noticeTexts(ctx)).join(' ')).not.toContain('Saved auto.md')
  })

  it('waits as long as the pause set for it', async () => {
    await setAutoSave(true)
    await ctx.page.evaluate(() => window.api.settings.patch({ autoSaveDelayMs: 6000 }))
    const file = join(ctx.workdir, 'slow.md')
    await openAndEdit(file, 'Saved already.\n', ' Typed slowly.')
    await waitForText(ctx, 'Typed slowly.')

    // A duration: past the usual pause, and short of the one set, nothing is
    // written yet.
    await ctx.page.waitForTimeout(PAST_THE_PAUSE_MS)
    expect(await onDisk(file)).toBe('Saved already.\n')
    await expect.poll(() => onDisk(file), { timeout: 15_000 }).toContain('Typed slowly.')

    await ctx.page.evaluate(() => window.api.settings.patch({ autoSaveDelayMs: 1000 }))
  })

  it('saves when the window loses focus, without waiting', async () => {
    // Typed with auto-save off, and switched on only once the edit has reached
    // the document (the title's unsaved marker): nothing changes after that, so
    // the pause never starts, and only the blur can save it. Racing the pause
    // instead failed on a slow Windows runner, whose save took longer than the
    // margin allowed.
    await setAutoSave(false)
    const file = join(ctx.workdir, 'blur.md')
    await openAndEdit(file, 'Before switching away.\n', ' Typed, then alt-tabbed.')
    await expect.poll(() => ctx.page.locator('.titlebar__title').innerText()).toMatch(/^•/)
    await setAutoSave(true)
    await ctx.page.evaluate(() => window.dispatchEvent(new Event('blur')))

    await expect.poll(() => onDisk(file), { timeout: 10_000 }).toContain('then alt-tabbed')
  })

  it('never overwrites a change another program made, and says so', async () => {
    const file = join(ctx.workdir, 'theirs.md')
    await writeFile(file, 'Opened here.\n', 'utf8')
    await openFile(ctx, file)
    await waitForText(ctx, 'Opened here.')

    // Another program rewrites it. A file opened on its own is not watched, so
    // the app only finds out when it tries to save.
    await writeFile(file, 'Rewritten by another program.\n', 'utf8')
    const later = new Date(Date.now() + 5000)
    await utimes(file, later, later)

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' Mine.')

    await expect
      .poll(() => noticeTexts(ctx), { timeout: 10_000 })
      .toContainEqual(expect.stringContaining('changed by another program'))
    expect(await onDisk(file)).toBe('Rewritten by another program.\n')
  })

  it('takes over once a new document has been saved by hand', async () => {
    // A new document was warned about from its first line, "Saving will
    // reformat...", and the warning kept auto-save away from it for good.
    const file = join(ctx.workdir, 'named.md')
    await ctx.app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: p,
      })) as typeof dialog.showSaveDialog
    }, file)
    await newDocument(ctx)
    await ctx.page.keyboard.type('Named by hand.')
    await ctx.page.keyboard.press('Control+s')
    await expect.poll(() => onDisk(file).catch(() => ''), { timeout: 10_000 }).toContain('Named')

    await ctx.page.keyboard.type(' Then saved by itself.')
    await expect.poll(() => onDisk(file), { timeout: 10_000 }).toContain('Then saved by itself.')
  })

  it('takes over a file it warned about, once that has been saved by hand', async () => {
    // Underlined headings are rewritten on save, which is warned about. Saved
    // anyway, the file is the editor's own and there is nothing left to warn of.
    const file = join(ctx.workdir, 'setext.md')
    await writeFile(file, 'Title\n=====\n\nBody.\n', 'utf8')
    await openFile(ctx, file)
    // Shown as a heading: the underline is not text on screen.
    await waitForText(ctx, 'Body.')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+End')
    await ctx.page.keyboard.type(' More.')
    await ctx.page.keyboard.press('Control+s')
    await expect.poll(() => onDisk(file), { timeout: 10_000 }).toContain('More.')

    await ctx.page.keyboard.type(' And more.')
    await expect.poll(() => onDisk(file), { timeout: 10_000 }).toContain('And more.')
  })

  it('leaves a document that was never saved alone', async () => {
    // It has nowhere to be written. Tried anyway, the save fails and says so,
    // naming the document; and auto-save must never ask for a name.
    const asked = async () =>
      ctx.app.evaluate(() => (globalThis as unknown as { __asked?: number }).__asked ?? 0)
    await ctx.app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __asked: number }
      g.__asked = 0
      dialog.showSaveDialog = (async () => {
        g.__asked++
        return { canceled: true, filePath: '' }
      }) as typeof dialog.showSaveDialog
    })

    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('No file for this yet.')
    await waitForText(ctx, 'No file for this yet.')
    const name = (await ctx.page.locator('.titlebar__title').innerText()).match(/Untitled \d*/)![0]

    // Waiting for nothing to happen, as above.
    await ctx.page.waitForTimeout(PAST_THE_PAUSE_MS)
    expect(await asked(), 'auto-save asked for a file name').toBe(0)
    expect((await noticeTexts(ctx)).join(' ')).not.toContain(name.trim())
    await setAutoSave(false)
  })
})
