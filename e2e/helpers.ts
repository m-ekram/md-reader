/**
 * Shared setup for the end-to-end suites.
 *
 * Every suite file gets its own application instance and its own temporary
 * directory. The suite used to be one 800-line file sharing a single app, and
 * that produced three failures that were the test's fault rather than the
 * code's — a tab index that assumed no other tabs were open, a submenu hover
 * race, and a case that only passed because an earlier test had run first.
 * Isolation costs a few seconds of launch time per file and removes that whole
 * category of problem.
 */
import { beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface AppContext {
  app: ElectronApplication
  page: Page
  /** Scratch directory for this suite's fixtures; removed afterwards. */
  workdir: string
  /** Console errors seen since launch, for suites that assert on them. */
  consoleErrors: string[]
}

/**
 * Launches the app for one suite file and tears it down afterwards.
 *
 * Returns a context whose fields are filled in by `beforeAll`, so tests read
 * `ctx.page` rather than capturing a binding that is still undefined at module
 * load.
 */
export function useApp(): AppContext {
  const ctx = { consoleErrors: [] as string[] } as AppContext

  beforeAll(async () => {
    ctx.workdir = await mkdtemp(join(tmpdir(), 'ekmd-e2e-'))

    // ELECTRON_RUN_AS_NODE is set in some shells and would boot Electron as
    // plain Node, with no application at all.
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
    }

    ctx.app = await electron.launch({
      // Its own user-data directory, or journals and settings leak between
      // suites and change what the app does on startup.
      args: ['.', `--user-data-dir=${join(ctx.workdir, 'userdata')}`],
      cwd: process.cwd(),
      env,
    })

    ctx.page = await ctx.app.firstWindow()
    ctx.page.on('console', (m) => {
      if (m.type() === 'error') ctx.consoleErrors.push(m.text())
    })
    ctx.page.on('pageerror', (e) => ctx.consoleErrors.push(String(e)))
    await ctx.page.waitForSelector('.app', { timeout: 30_000 })
  }, 90_000)

  afterAll(async () => {
    await ctx.app?.close()
    await rm(ctx.workdir, { recursive: true, force: true })
  })

  return ctx
}

/** Opens a path through main, exactly as the File menu would. */
export async function openFile(ctx: AppContext, path: string): Promise<void> {
  await ctx.app.evaluate(async ({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', p)
  }, path)
}

/**
 * Waits for the editor to show some text.
 *
 * A condition wait rather than a fixed sleep: loading a file takes an amount of
 * time that varies with the machine, and the suite was full of arbitrary
 * timeouts that were either too short on a slow run or wasted on a fast one.
 */
export async function waitForText(
  ctx: AppContext,
  needle: string,
  timeout = 15_000
): Promise<void> {
  await ctx.page.waitForFunction(
    (text) => document.querySelector('.ProseMirror')?.textContent?.includes(text) ?? false,
    needle,
    { timeout }
  )
}

/** Waits until the editor no longer shows some text. */
export async function waitForNoText(
  ctx: AppContext,
  needle: string,
  timeout = 15_000
): Promise<void> {
  await ctx.page.waitForFunction(
    (text) => !(document.querySelector('.ProseMirror')?.textContent?.includes(text) ?? false),
    needle,
    { timeout }
  )
}

/** Opens a top-level menu and waits for it to actually be on screen. */
export async function openMenu(ctx: AppContext, label: string): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.locator('.menubar__top', { hasText: new RegExp(`^${label}$`) }).click()
  await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
}

/** Clicks an item in the open menu, then waits for the menu to close. */
export async function clickMenuItem(ctx: AppContext, label: string): Promise<void> {
  await ctx.page.locator('.menu[role="menu"] .menu__item', { hasText: label }).first().click()
}

/** Opens a submenu within the open menu and waits for it to appear. */
export async function openSubmenu(ctx: AppContext, label: string): Promise<void> {
  await ctx.page.locator('.menu__item', { hasText: label }).first().click()
  await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible', timeout: 5000 })
}

/** Starts a new empty document and puts the caret in it. */
export async function newDocument(ctx: AppContext): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  const before = await ctx.page.locator('.ProseMirror').count()
  await ctx.page.keyboard.press('Control+n')
  // Wait for the editor to be replaced rather than guessing at a delay.
  await ctx.page
    .waitForFunction((n) => document.querySelectorAll('.ProseMirror').length >= n, before, {
      timeout: 10_000,
    })
    .catch(() => undefined)
  await ctx.page.locator('.ProseMirror').click()
}
