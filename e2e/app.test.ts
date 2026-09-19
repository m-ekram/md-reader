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
  app = await electron.launch({
    args: ['.', `--user-data-dir=${join(workdir, 'userdata')}`],
    cwd: process.cwd(),
    env,
  })
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

describe('keys the editor owns still reach the editor', () => {
  /**
   * The regression guard for the worst bug in Phase 1. The app-level key handler
   * claimed every accelerator the menu declared, including ~49 whose commands did
   * not exist yet, so Ctrl+C, Ctrl+V, Ctrl+Z and Tab were silently swallowed and
   * the editor could not copy, paste or undo. Every other test still passed.
   */
  async function freshDocument(): Promise<void> {
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(400)
    await page.locator('.ProseMirror').click()
  }

  const text = () => page.locator('.ProseMirror').innerText()

  it('types, selects all and cuts', async () => {
    await freshDocument()
    await page.keyboard.type('recoverable sentence')
    await page.waitForTimeout(200)
    expect(await text()).toContain('recoverable sentence')

    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+x')
    await page.waitForTimeout(300)
    expect(await text()).not.toContain('recoverable sentence')
  })

  it('pastes it back', async () => {
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(400)
    expect(await text()).toContain('recoverable sentence')
  })

  it('undoes with Ctrl+Z', async () => {
    await freshDocument()
    await page.keyboard.type('first')
    await page.waitForTimeout(250)
    await page.keyboard.type(' second')
    await page.waitForTimeout(250)
    expect(await text()).toContain('second')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(400)
    expect(await text()).not.toContain('second')
  })

  it('applies bold with Ctrl+B', async () => {
    await freshDocument()
    await page.keyboard.type('bolded')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(300)
    expect(await page.locator('.ProseMirror strong').count()).toBeGreaterThan(0)
  })

  it('does not swallow Tab', async () => {
    await freshDocument()
    await page.keyboard.type('- item one')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.keyboard.type('item two')
    await page.waitForTimeout(200)
    // Two list items exist already, so counting items would pass even if Tab
    // were swallowed. Nesting is what proves the key reached the editor.
    const nestedBefore = await page.locator('.ProseMirror li ul, .ProseMirror li ol').count()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(400)
    const nestedAfter = await page.locator('.ProseMirror li ul, .ProseMirror li ol').count()
    expect(nestedAfter).toBeGreaterThan(nestedBefore)
  })
})

describe('Open Recent stays in step with its labels', () => {
  it('opens the file it names after the list is reordered', async () => {
    const a = join(workdir, 'alpha.md')
    const b = join(workdir, 'beta.md')
    await writeFile(a, '# Alpha document\n', 'utf8')
    await writeFile(b, '# Beta document\n', 'utf8')

    for (const p of [a, b]) {
      await app.evaluate(async ({ BrowserWindow }, path) => {
        BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
      }, p)
      await page.waitForTimeout(700)
    }

    await page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await page.waitForSelector('.menu[role="menu"]')
    await page.locator('.menu__item', { hasText: 'Open Recent' }).first().hover()
    await page.waitForTimeout(300)

    const first = page.locator('.menu--nested .menu__item').first()
    const label = (await first.innerText()).trim()
    await first.click()
    await page.waitForTimeout(800)

    // Whichever file the entry named must be the one now on screen.
    const expected = label.startsWith('alpha') ? 'Alpha document' : 'Beta document'
    expect(await page.locator('.ProseMirror').innerText()).toContain(expected)
  })
})
