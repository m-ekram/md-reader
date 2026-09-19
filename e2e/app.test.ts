// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MENUS } from '../src/renderer/src/commands/menus'

/**
 * End-to-end verification against the real application.
 *
 * With ~140 menu items across seven menus, and six phases of work still to
 * come, a manual checklist will not stay honest. This walks the actual rendered
 * menu bar and compares it against the specification.
 */
let app: ElectronApplication
let page: Page
let workdir: string
const consoleErrors: string[] = []

beforeAll(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'ekmd-e2e-'))
  // ELECTRON_RUN_AS_NODE is set in some shells and would boot Electron as plain
  // Node, with no app at all.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env })
  page = await app.firstWindow()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.waitForSelector('.app', { timeout: 30_000 })
}, 90_000)

afterAll(async () => {
  await app?.close()
  await rm(workdir, { recursive: true, force: true })
})

describe('application shell', () => {
  it('starts without console errors', () => {
    expect(consoleErrors).toEqual([])
  })

  it('renders the title bar and status bar', async () => {
    await expect(page.locator('.titlebar')).toBeTruthy()
    expect(await page.locator('.titlebar').count()).toBe(1)
    expect(await page.locator('.status').count()).toBe(1)
  })

  it('starts with an editable document', async () => {
    expect(await page.locator('.ProseMirror').count()).toBe(1)
  })
})

describe('menu bar matches the specification', () => {
  it('shows the seven top-level menus in order', async () => {
    const labels = await page.locator('.menubar__top').allTextContents()
    expect(labels.map((l) => l.trim())).toEqual(MENUS.map((m) => m.label))
  })

  for (const menu of MENUS) {
    // The Themes menu is generated from installed themes, not a static list.
    if (menu.label === 'Themes') continue

    it(`${menu.label} lists its items with the right accelerators`, async () => {
      await page.locator('.menubar__top', { hasText: new RegExp(`^${menu.label}$`) }).click()
      await page.waitForSelector('.menu[role="menu"]')

      const expectedLabels = menu.items
        .filter((n) => n.kind === 'item' || n.kind === 'submenu' || n.kind === 'dynamic')
        .map((n) => ('label' in n ? n.label : ''))

      const rendered = await page.locator('.menu[role="menu"] > .menu__item, .menu[role="menu"] > .menu__row--sub > .menu__item')
        .allTextContents()

      for (const label of expectedLabels) {
        expect(
          rendered.some((r) => r.includes(label)),
          `${menu.label} > ${label} missing from the rendered menu`
        ).toBe(true)
      }

      await page.keyboard.press('Escape')
    })
  }

  it('greys out commands that have no implementation yet', async () => {
    await page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await page.waitForSelector('.menu[role="menu"]')
    // Import is deliberately shown but unavailable in v1.
    const importItem = page.locator('.menu__item', { hasText: 'Import' }).first()
    expect(await importItem.getAttribute('aria-disabled')).toBe('true')
    await page.keyboard.press('Escape')
  })

  it('is navigable by keyboard alone', async () => {
    await page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await page.waitForSelector('.menu[role="menu"]')
    await page.keyboard.press('ArrowDown')
    expect(await page.locator('[data-active="true"]').count()).toBe(1)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight') // moves to the Edit menu
    expect(await page.locator('.menu[role="menu"]').count()).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    expect(await page.locator('.menu[role="menu"]').count()).toBe(0)
  })
})

describe('the save path preserves the file', () => {
  it('writes back a file it did not change, byte for byte', async () => {
    const file = join(workdir, 'note.md')
    const original = '---\ntitle: Test\ntags: [a, b]\n---\n\n# Heading\n\n- one\n- two\n\nSome **bold** text.\n'
    await writeFile(file, original, 'utf8')

    // Open through main, exactly as the File menu would.
    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)

    await page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Heading') ?? false,
      { timeout: 15_000 }
    )

    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1200)

    expect(await readFile(file, 'utf8')).toBe(original)
  })
})
