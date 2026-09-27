// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Launching the app with files, as double-clicking a .md file does.
 *
 * The path used to be sent when the window was shown, which in measured
 * launches was often before the page was listening: the file was dropped, and
 * the user got an empty Untitled document instead. When it did arrive, the
 * blank document stayed beside it. Extra files were sent before the page had
 * even loaded. These launch the real app with real arguments, which the other
 * suites bypass by sending the path over IPC.
 */
let app: ElectronApplication | undefined
let workdir: string | undefined

afterEach(async () => {
  await app?.close().catch(() => {})
  app = undefined
  if (workdir) await rm(workdir, { recursive: true, force: true })
  workdir = undefined
})

async function launchWith(files: Array<{ name: string; text: string }>): Promise<Page> {
  workdir = await mkdtemp(join(tmpdir(), 'ekmd-launch-'))
  const paths: string[] = []
  for (const f of files) {
    const p = join(workdir, f.name)
    await writeFile(p, f.text, 'utf8')
    paths.push(p)
  }
  return start(paths)
}

/** Launches on the suite's profile, so a relaunch sees what the last run left. */
async function start(paths: string[]): Promise<Page> {
  // ELECTRON_RUN_AS_NODE is set in some shells and would boot Electron as
  // plain Node, with no application at all.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  app = await electron.launch({
    args: ['.', `--user-data-dir=${join(workdir!, 'userdata')}`, ...paths],
    cwd: process.cwd(),
    env,
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app', { timeout: 30_000 })
  return page
}

/**
 * Closes the window as a user does, then starts the app again with no files
 * on the same profile. Not `app.close()`: that quits, and a quit closes windows
 * without asking their pages, so what a page keeps on closing is never kept.
 */
async function relaunch(): Promise<Page> {
  const exited = new Promise<void>((resolve) => app!.once('close', () => resolve()))
  await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await exited
  app = undefined
  return start([])
}

/** The names of the open documents, whichever way they are shown. */
function openNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tab__name')].map((t) => t.textContent ?? '')
    if (tabs.length > 0) return tabs
    // One document: no tab bar; the title bar names it.
    const title = document.querySelector('.titlebar__title')?.textContent ?? ''
    return [title.replace(/^•\s*/, '').replace(/\s+—\s+ekram\.md$/, '')]
  })
}

describe('launching with files', () => {
  it('opens the file it was launched with, and nothing else', async () => {
    const page = await launchWith([
      { name: 'launched.md', text: '# Launched\n\nOpened by path.\n' },
    ])

    await page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Opened by path.'),
      null,
      { timeout: 15_000 }
    )
    // No blank Untitled beside it: the file is what the user asked to see.
    await expect.poll(() => openNames(page), { timeout: 5000 }).toEqual(['launched.md'])
  }, 90_000)

  it('opens every file it was launched with', async () => {
    const page = await launchWith([
      { name: 'first.md', text: '# First\n' },
      { name: 'second.md', text: '# Second\n' },
    ])

    await expect
      .poll(async () => (await openNames(page)).sort(), { timeout: 15_000 })
      .toEqual(['first.md', 'second.md'])
  }, 90_000)
})

describe('closing the app with "Don\'t Save"', () => {
  it('leaves nothing to be "recovered" at the next launch', async () => {
    const page = await launchWith([])
    await page.locator('.welcome').waitFor({ state: 'visible', timeout: 15_000 })
    await page.keyboard.press('Control+n')
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Thrown away on purpose.')

    // Journalled first, as unsaved work always is.
    const journalDir = join(workdir!, 'userdata', 'journal')
    const journalled = async () => {
      for (const f of await readdir(journalDir).catch(() => [] as string[])) {
        const text = await readFile(join(journalDir, f), 'utf8').catch(() => '')
        if (text.includes('Thrown away on purpose.')) return true
      }
      return false
    }
    await expect.poll(journalled, { timeout: 10_000 }).toBe(true)

    // Close the window and answer the question with Don't Save.
    await app!.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 1,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox
    })
    const exited = new Promise<void>((resolve) => app!.once('close', () => resolve()))
    await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await exited
    app = undefined

    // The user chose to discard it: it must not come back as a recovery.
    expect(await journalled(), 'the discarded work was kept for recovery').toBe(false)
  }, 90_000)
})

describe('the next launch', () => {
  it('reopens the files that were open, with the same one in front', async () => {
    const page = await launchWith([
      { name: 'alpha.md', text: '# Alpha\n\nThe first file.\n' },
      { name: 'beta.md', text: '# Beta\n\nThe second file.\n' },
    ])
    await expect
      .poll(async () => (await openNames(page)).sort(), { timeout: 15_000 })
      .toEqual(['alpha.md', 'beta.md'])
    // Bring the first one to the front, so "which was in front" is tested.
    await page.locator('.tab__select', { hasText: 'alpha.md' }).click()
    await page.waitForFunction(() =>
      document.querySelector('.ProseMirror')?.textContent?.includes('The first file.')
    )

    const next = await relaunch()
    await expect
      .poll(async () => (await openNames(next)).sort(), { timeout: 15_000 })
      .toEqual(['alpha.md', 'beta.md'])
    await next.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('The first file.'),
      null,
      { timeout: 15_000 }
    )
  }, 120_000)

  it('reopens a file the app was launched with, though nothing else happened', async () => {
    // Double-clicked in Explorer, read, closed. Nothing changed after it
    // opened, and at first nothing was kept.
    const page = await launchWith([{ name: 'opened.md', text: '# Opened\n\nFrom Explorer.\n' }])
    await page.waitForFunction(() =>
      document.querySelector('.ProseMirror')?.textContent?.includes('From Explorer.')
    )

    const next = await relaunch()
    await next.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('From Explorer.'),
      null,
      { timeout: 15_000 }
    )
  }, 120_000)

  it('starts at the welcome screen when there is nothing to reopen', async () => {
    const page = await launchWith([])
    await page.locator('.welcome').waitFor({ state: 'visible', timeout: 15_000 })
    expect(await page.locator('.ProseMirror').count()).toBe(0)

    // New is ready for Enter: starting to write is one key away.
    await page.keyboard.press('Enter')
    await page.locator('.ProseMirror').waitFor({ state: 'visible', timeout: 15_000 })
  }, 90_000)

  it('does not reopen them when that is switched off', async () => {
    const page = await launchWith([{ name: 'gamma.md', text: '# Gamma\n' }])
    await page.waitForFunction(() =>
      document.querySelector('.ProseMirror')?.textContent?.includes('Gamma')
    )
    await page.evaluate(async () => {
      const s = await window.api.settings.get()
      await window.api.settings.patch({ session: { ...s.session, restore: false } })
    })

    const next = await relaunch()
    await next.locator('.welcome').waitFor({ state: 'visible', timeout: 15_000 })
    expect(await next.locator('.tab__name').count()).toBe(0)
  }, 120_000)
})
