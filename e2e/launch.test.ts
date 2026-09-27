// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  // ELECTRON_RUN_AS_NODE is set in some shells and would boot Electron as
  // plain Node, with no application at all.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  app = await electron.launch({
    args: ['.', `--user-data-dir=${join(workdir, 'userdata')}`, ...paths],
    cwd: process.cwd(),
    env,
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app', { timeout: 30_000 })
  return page
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
