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
import { beforeAll, beforeEach, afterAll, expect } from 'vitest'
import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from 'playwright'
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
 * Waits until the window is on screen and painting.
 *
 * A hidden window still answers every DOM query, so `.app` appears and the
 * suite looks healthy — and then each test spends its whole timeout inside
 * Playwright's "waiting for element to be visible, enabled and stable", which
 * needs animation frames a hidden window never produces. Three suites once
 * failed all their tests that way. Failing here says what actually happened,
 * once, instead of one 30-second timeout per test.
 */
async function waitUntilPainting(ctx: AppContext): Promise<void> {
  const deadline = Date.now() + 20_000
  let visible = false
  while (Date.now() < deadline) {
    visible = await ctx.app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
    )
    if (visible) {
      const painted = await ctx.page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            requestAnimationFrame(() => resolve(true))
            setTimeout(() => resolve(false), 3000)
          })
      )
      if (painted) return
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    visible
      ? 'the window is visible but never painted a frame, so nothing can be clicked'
      : 'the window never appeared, so nothing can be clicked'
  )
}

/**
 * Launches the app for one suite file and tears it down afterwards.
 *
 * Returns a context whose fields are filled in by `beforeAll`, so tests read
 * `ctx.page` rather than capturing a binding that is still undefined at module
 * load.
 */
/**
 * What to launch: the built sources in `out/`, or a packaged build when
 * `E2E_EXE` names its executable (`npm run test:e2e:win`). Smart App Control
 * blocks the development Electron on the Windows machine this is written on,
 * but not the packaged app, so that is how the suite runs on Windows locally.
 */
export function launchTarget(args: string[]): { args: string[]; executablePath?: string } {
  const exe = process.env.E2E_EXE
  return exe ? { executablePath: exe, args } : { args: ['.', ...args] }
}

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
    // A packaged build would otherwise ask GitHub for updates during the run.
    env.EKRAM_NO_UPDATES = '1'

    ctx.app = await electron.launch({
      // Its own user-data directory, or journals and settings leak between
      // suites and change what the app does on startup.
      ...launchTarget([`--user-data-dir=${join(ctx.workdir, 'userdata')}`]),
      cwd: process.cwd(),
      env,
    })

    ctx.page = await ctx.app.firstWindow()
    ctx.page.on('console', (m) => {
      if (m.type() === 'error') ctx.consoleErrors.push(m.text())
    })
    ctx.page.on('pageerror', (e) => ctx.consoleErrors.push(String(e)))
    await ctx.page.waitForSelector('.app', { timeout: 30_000 })
    await waitUntilPainting(ctx)
    await startDocument(ctx)
  }, 90_000)

  /**
   * Parks the pointer in a corner before every test.
   *
   * A test that clicked something leaves the pointer there, and the next test
   * inherits it: an overlay opening under a resting pointer once changed which
   * command the palette ran, and the failure depended on which test had run
   * first. Each test now starts from the same place.
   */
  beforeEach(async () => {
    if (ctx.page && !ctx.page.isClosed()) await ctx.page.mouse.move(0, 0).catch(() => {})
  })

  afterAll(async () => {
    await ctx.app?.close()
    await rm(ctx.workdir, { recursive: true, force: true })
  })

  return ctx
}

/**
 * Leaves the welcome screen for a new document, as most suites start with one.
 * Also after a reload, which comes back to the welcome screen when the only
 * documents open were never saved.
 */
export async function startDocument(ctx: AppContext): Promise<void> {
  await ctx.page.waitForSelector('.welcome, .ProseMirror', { timeout: 30_000 })
  if ((await ctx.page.locator('.ProseMirror').count()) > 0) return
  await ctx.page.keyboard.press('Control+n')
  await ctx.page.waitForSelector('.ProseMirror', { timeout: 15_000 })
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

/**
 * Clicks an item in the open menu, matched by substring. It does not wait for
 * anything; prefer `chooseMenu`, which matches exactly and waits for the menu
 * to close.
 */
export async function clickMenuItem(ctx: AppContext, label: string): Promise<void> {
  await ctx.page.locator('.menu[role="menu"] .menu__item', { hasText: label }).first().click()
}

/** Opens a submenu within the open menu and waits for it to appear. */
export async function openSubmenu(ctx: AppContext, label: string): Promise<void> {
  await ctx.page.locator('.menu__item', { hasText: label }).first().click()
  await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible', timeout: 5000 })
}

/**
 * Creates a new document and puts the caret in it.
 *
 * Waits for the editor on screen to be a different element. This used to wait
 * until the number of editors was at least what it had been — true before
 * Ctrl+N had done anything — and swallowed its own timeout, so it waited for
 * nothing while its comment claimed otherwise.
 */
export async function newDocument(ctx: AppContext): Promise<void> {
  await ctx.page.keyboard.press('Escape')
  // A fresh token per call: pooled editors keep their element, so a marker
  // left by an earlier call could be back on screen.
  const token = Math.random().toString(36).slice(2)
  await ctx.page.evaluate((t) => {
    document.querySelector('.ProseMirror')?.setAttribute('data-before-new', t)
  }, token)
  await ctx.page.keyboard.press('Control+n')
  await ctx.page.waitForSelector(`.ProseMirror:not([data-before-new="${token}"])`, {
    timeout: 10_000,
  })
  await ctx.page.locator('.ProseMirror').click()
}

/**
 * Waits until the page has rendered twice.
 *
 * For asserting that something did *not* happen, where there is no condition
 * to poll for. Vue applies DOM updates in a microtask, so two animation frames
 * guarantee any update a click caused is already on screen — a precise bound,
 * unlike a sleep chosen by feel.
 */
export async function nextFrames(ctx: AppContext): Promise<void> {
  await ctx.page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  )
}

/** The brief messages showing, oldest first. */
export async function noticeTexts(ctx: AppContext): Promise<string[]> {
  return ctx.page.locator('.notes .note__text').allInnerTexts()
}

/** Escapes text for use inside a regular expression. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The item at the end of a menu path, with the menu left open.
 *
 * Matched on the label element, exactly: an item's own text also carries its
 * checkmark and accelerator, and a substring match on it picks "Smart Quotes"
 * when asked for "Quote". A trailing ellipsis is allowed for, so callers name
 * items as the menu spec does without one.
 */
export async function menuItem(ctx: AppContext, menu: string, ...path: string[]): Promise<Locator> {
  await ctx.page.keyboard.press('Escape')
  await ctx.page.locator('.menubar__top', { hasText: new RegExp(`^${literal(menu)}$`) }).click()
  await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })

  const byLabel = (scope: string, label: string): Locator =>
    ctx.page
      .locator(`${scope} .menu__item`)
      .filter({
        has: ctx.page.locator('.menu__label', { hasText: new RegExp(`^${literal(label)}…?$`) }),
      })
      .first()

  for (const [i, label] of path.entries()) {
    const isLast = i === path.length - 1
    // The first level lives in the top menu; each submenu opens a nested one.
    const scope = i === 0 ? '.menu[role="menu"]' : '.menu--nested'
    const item = byLabel(scope, label)
    if (isLast) return item
    await item.click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
  }
  throw new Error('menuItem needs at least one item after the menu name')
}

/**
 * Chooses a menu item, and waits for the menu to close.
 *
 * Choosing an item closes the menu before its command runs, so the menu
 * disappearing is a precise signal that the command has started. Its effect
 * may land a moment later: assert on it with `expect.poll`, not a sleep.
 */
export async function chooseMenu(ctx: AppContext, menu: string, ...path: string[]): Promise<void> {
  const item = await menuItem(ctx, menu, ...path)
  await item.click()
  await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'detached', timeout: 5000 })
}

/**
 * Waits until the folder watcher for `root` is ready. It starts asynchronously
 * after a folder is opened, and a change made before then is never seen: a
 * fixed 800 ms pause here once let a rename go unnoticed on a busy machine.
 */
export async function watcherReady(ctx: AppContext, root: string): Promise<void> {
  await expect
    .poll(
      () =>
        ctx.app.evaluate(
          () => (globalThis as unknown as { __watcherReady?: string }).__watcherReady ?? null
        ),
      { timeout: 20_000 }
    )
    .toBe(root)
}
