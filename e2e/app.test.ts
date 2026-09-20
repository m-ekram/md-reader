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

      const rendered = await page
        .locator(
          '.menu[role="menu"] > .menu__item, .menu[role="menu"] > .menu__row--sub > .menu__item'
        )
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
    const original =
      '---\ntitle: Test\ntags: [a, b]\n---\n\n# Heading\n\n- one\n- two\n\nSome **bold** text.\n'
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

    // Start from a known state: an earlier test may have left a menu open, and
    // hovering a submenu that is already open does not re-trigger it.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)

    await page.locator('.menubar__top', { hasText: /^File$/ }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })

    // Clicking is deterministic where hovering depends on pointer timing.
    await page.locator('.menu__item', { hasText: 'Open Recent' }).first().click()
    await page.waitForSelector('.menu--nested .menu__item', { state: 'visible', timeout: 5000 })

    const first = page.locator('.menu--nested .menu__item').first()
    const label = (await first.innerText()).trim()
    await first.click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'detached', timeout: 5000 })
    await page.waitForTimeout(600)

    // Whichever file the entry named must be the one now on screen.
    const expected = label.startsWith('alpha') ? 'Alpha document' : 'Beta document'
    expect(await page.locator('.ProseMirror').innerText()).toContain(expected)
  })
})

describe('undo history survives switching tabs', () => {
  /**
   * The reason the editor pool exists. Phase 1 rebuilt the editor on every
   * switch, so coming back to a tab found an empty undo stack and Ctrl+Z did
   * nothing — losing work the user assumed was recoverable.
   */
  it('undoes edits made before switching away and back', async () => {
    // Earlier tests leave their own tabs open, so address ours by index rather
    // than assuming this is the only document in the window.
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    const alphaIndex = (await page.locator('.tab__select').count()) - 1
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('alpha base')
    // ProseMirror groups edits made within ~500ms into a single undo step, so
    // the two edits need a gap to become separately undoable.
    await page.waitForTimeout(900)
    await page.keyboard.type(' ALPHA-EXTRA')
    await page.waitForTimeout(400)

    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('beta document')
    await page.waitForTimeout(400)

    // Back to the alpha document via the tab bar.
    await page.locator('.tab__select').nth(alphaIndex).click()
    await page.waitForTimeout(700)

    const before = await page.locator('.ProseMirror').innerText()
    expect(before).toContain('ALPHA-EXTRA')

    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)

    const after = await page.locator('.ProseMirror').innerText()
    expect(after, 'Ctrl+Z after a tab switch must still undo').not.toContain('ALPHA-EXTRA')
    expect(after).toContain('alpha')
  })
})

describe('workspace, sidebar and watching', () => {
  const notes = () => join(workdir, 'notes')

  async function openWorkspace(): Promise<void> {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(notes(), 'sub'), { recursive: true })
    await writeFile(join(notes(), 'first.md'), '# First note\n\nsearchable haystack here\n', 'utf8')
    await writeFile(join(notes(), 'second.md'), '# Second note\n\n## Nested heading\n', 'utf8')
    await writeFile(join(notes(), 'sub', 'third.md'), '# Third note\n', 'utf8')
    await writeFile(join(notes(), 'ignored.txt'), 'not markdown\n', 'utf8')

    // Set through main, exactly as Open Folder would; settings broadcast back.
    await page.evaluate((root) => window.api.workspace.set(root), notes())
    await page.waitForTimeout(1200)
  }

  it('lists the folder in the file tree, markdown only', async () => {
    await openWorkspace()
    await page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'files' },
      })
    )
    await page.waitForSelector('.sidebar', { state: 'visible' })
    await page.waitForTimeout(400)

    const names = await page.locator('.tree__name').allTextContents()
    expect(names).toContain('first.md')
    expect(names).toContain('second.md')
    expect(names).toContain('sub')
    // A .txt file is not a markdown file and must not be listed.
    expect(names).not.toContain('ignored.txt')
  })

  it('expands a folder lazily and opens a nested file', async () => {
    await page.locator('.tree__item', { hasText: 'sub' }).first().click()
    await page.waitForTimeout(500)
    expect(await page.locator('.tree__name').allTextContents()).toContain('third.md')

    await page.locator('.tree__item', { hasText: 'third.md' }).first().click()
    await page.waitForTimeout(900)
    expect(await page.locator('.ProseMirror').innerText()).toContain('Third note')
  })

  it('lists every markdown file in Articles, flat', async () => {
    await page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'articles' },
      })
    )
    await page.waitForTimeout(600)
    const names = await page.locator('.articles__name').allTextContents()
    // Flat: the nested file appears alongside the top-level ones.
    expect(names).toEqual(expect.arrayContaining(['first.md', 'second.md', 'third.md']))
  })

  it('shows headings of the active document in the Outline', async () => {
    await page.locator('.articles__item', { hasText: 'second.md' }).first().click()
    await page.waitForTimeout(900)
    await page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'outline' },
      })
    )
    await page.waitForTimeout(500)

    const headings = await page.locator('.outline__item').allTextContents()
    expect(headings.map((h) => h.trim())).toEqual(['Second note', 'Nested heading'])
  })

  it('searches the folder and streams results', async () => {
    await page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 300, panel: 'search' },
      })
    )
    await page.waitForSelector('.search__input', { state: 'visible' })
    await page.locator('.search__input').fill('searchable haystack')
    await page.waitForSelector('.results__hit', { timeout: 15_000 })

    const previews = await page.locator('.results__preview').allTextContents()
    expect(previews.join(' ')).toContain('searchable haystack')
    expect(await page.locator('.results__name').first().innerText()).toContain('first.md')
  })

  it('reloads a clean document when the file changes on disk', async () => {
    await page.evaluate(() =>
      window.api.settings.patch({
        sidebar: { visible: true, width: 260, panel: 'articles' },
      })
    )
    await page.waitForTimeout(400)
    await page.locator('.articles__item', { hasText: 'first.md' }).first().click()
    await page.waitForTimeout(900)
    expect(await page.locator('.ProseMirror').innerText()).toContain('First note')

    await writeFile(join(notes(), 'first.md'), '# Rewritten externally\n\nnew body\n', 'utf8')
    // Clean document: no prompt, it should just follow the file.
    await page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('Rewritten externally') ??
        false,
      { timeout: 15_000 }
    )
  })

  it('keeps the tab and its content when the file is deleted', async () => {
    const { rm } = await import('node:fs/promises')
    const before = await page.locator('.ProseMirror').innerText()
    await rm(join(notes(), 'first.md'), { force: true })
    await page.waitForTimeout(2500)

    // The tab must survive: a sync client removing a file must not discard work.
    expect(await page.locator('.ProseMirror').innerText()).toBe(before)
  })
})

describe('Open Quickly', () => {
  it('ranks an exact filename match first and opens it', async () => {
    // The workspace from the previous block is still open.
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+p')
    await page.waitForSelector('.quick__panel', { state: 'visible', timeout: 10_000 })

    await page.locator('.quick__input').fill('second')
    await page.waitForTimeout(400)

    const names = await page.locator('.quick__name').allTextContents()
    expect(names.length).toBeGreaterThan(0)
    expect(names[0]).toBe('second.md')

    await page.keyboard.press('Enter')
    await page.waitForTimeout(900)
    expect(await page.locator('.ProseMirror').innerText()).toContain('Second note')
  })

  it('matches a subsequence, not just a prefix', async () => {
    await page.keyboard.press('Control+p')
    await page.waitForSelector('.quick__panel', { state: 'visible' })
    // "trd" is a subsequence of "third.md" but not a prefix of anything.
    await page.locator('.quick__input').fill('trd')
    await page.waitForTimeout(400)
    expect(await page.locator('.quick__name').allTextContents()).toContain('third.md')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    expect(await page.locator('.quick__panel').count()).toBe(0)
  })
})

describe('mermaid diagrams', () => {
  it('renders a diagram below its fence', async () => {
    const file = join(workdir, 'diagram.md')
    await writeFile(file, '# Diagram\n\n```mermaid\ngraph TD\n  A-->B\n```\n', 'utf8')

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)

    // First use loads roughly a megabyte of library, so allow for that.
    await page.waitForSelector('.mermaid-figure svg', { timeout: 30_000 })
    const svg = await page.locator('.mermaid-figure svg').first()
    expect(await svg.count()).toBeGreaterThan(0)
  })

  it('shows an error inline instead of throwing on invalid syntax', async () => {
    const file = join(workdir, 'broken.md')
    await writeFile(file, '```mermaid\nnot a real diagram !!!\n```\n', 'utf8')

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)

    // More than one figure can be on the page, and rendering is async, so poll
    // for any of them reporting the failure rather than sampling the first.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.mermaid-figure')].some((el) =>
          el.classList.contains('is-error')
        ),
      { timeout: 25_000 }
    )
    const texts = await page.locator('.mermaid-figure.is-error').allTextContents()
    expect(texts.join(' ')).toMatch(/diagram|syntax|error/i)
    // The source must survive a failed render: the fence is still editable text.
    expect(await page.locator('.ProseMirror').innerText()).toContain('not a real diagram')
  })

  it('keeps the fence source intact when saved', async () => {
    const file = join(workdir, 'diagram.md')
    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)
    await page.waitForTimeout(1500)
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1200)

    const after = await readFile(file, 'utf8')
    expect(after).toContain('```mermaid')
    expect(after).toContain('graph TD')
  })
})

describe('Paragraph and Format menus act on the document', () => {
  async function blankDocWithText(text: string): Promise<void> {
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    await page.locator('.ProseMirror').click()
    await page.keyboard.type(text)
    await page.waitForTimeout(250)
    await page.keyboard.press('Control+a')
  }

  async function chooseMenuItem(menu: string, label: string): Promise<void> {
    await page.locator('.menubar__top', { hasText: new RegExp(`^${menu}$`) }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await page.locator('.menu[role="menu"] .menu__item', { hasText: label }).first().click()
    await page.waitForTimeout(500)
  }

  it('turns a paragraph into a heading', async () => {
    await blankDocWithText('Becomes a heading')
    await chooseMenuItem('Paragraph', 'Heading 2')
    expect(await page.locator('.ProseMirror h2').count()).toBeGreaterThan(0)
  })

  it('applies bold from the Format menu', async () => {
    await blankDocWithText('Make me bold')
    await chooseMenuItem('Format', 'Strong')
    expect(await page.locator('.ProseMirror strong').count()).toBeGreaterThan(0)
  })

  it('wraps a paragraph in a quote', async () => {
    await blankDocWithText('Quote this')
    await chooseMenuItem('Paragraph', 'Quote')
    expect(await page.locator('.ProseMirror blockquote').count()).toBeGreaterThan(0)
  })

  it('inserts an alert with its marker', async () => {
    await blankDocWithText('Careful now')
    await page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await page.locator('.menu__item', { hasText: 'Alert' }).first().click()
    await page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
    await page.locator('.menu--nested .menu__item', { hasText: 'Warning' }).first().click()
    await page.waitForTimeout(600)

    expect(await page.locator('.ProseMirror blockquote[data-alert="warning"]').count()).toBe(1)
  })

  it('greys out table commands when the cursor is not in a table', async () => {
    await blankDocWithText('Not a table')
    await page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await page.locator('.menu__item', { hasText: 'Table' }).first().click()
    await page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })

    const addRow = page.locator('.menu--nested .menu__item', { hasText: 'Add Row Above' }).first()
    expect(await addRow.getAttribute('aria-disabled')).toBe('true')
    // Inserting a table is always available, though.
    const insert = page.locator('.menu--nested .menu__item', { hasText: 'Insert Table' }).first()
    expect(await insert.getAttribute('aria-disabled')).toBe('false')
    await page.keyboard.press('Escape')
  })
})

describe('pasted images', () => {
  it('writes the image beside the document and links it relatively', async () => {
    const { mkdir, readdir } = await import('node:fs/promises')
    const dir = join(workdir, 'withimages')
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'note.md')
    await writeFile(file, '# Has images\n\n', 'utf8')

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)
    await page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Has images') ?? false,
      { timeout: 15_000 }
    )

    // A real paste with a real PNG: a 1x1 image, built in the page and put on
    // the editor's clipboard as a File, which is what a screenshot paste looks
    // like to the handler.
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+End')
    await page.evaluate(() => {
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const file = new File([bytes], 'pasted-shot.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      document
        .querySelector('.ProseMirror')!
        .dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        )
    })

    await page.waitForTimeout(2000)

    // The bytes must be on disk, in the assets folder next to the note.
    const assets = await readdir(join(dir, 'assets')).catch(() => [] as string[])
    expect(assets.some((f) => f.endsWith('.png'))).toBe(true)

    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1200)

    const saved = await readFile(file, 'utf8')
    // Relative, forward-slashed, and not a base64 blob.
    expect(saved).toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/)
    expect(saved).not.toContain('base64')
  })
})

describe('relative images display', () => {
  it('loads an image linked relatively to the document', async () => {
    const { mkdir } = await import('node:fs/promises')
    const dir = join(workdir, 'shows')
    await mkdir(join(dir, 'assets'), { recursive: true })

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    await writeFile(join(dir, 'assets', 'pic.png'), png)
    const file = join(dir, 'note.md')
    await writeFile(file, '# Pic\n\n![a picture](assets/pic.png)\n', 'utf8')

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)
    await page.waitForSelector('.ProseMirror img', { timeout: 15_000 })

    // Writing the file and rendering it are different things: the earlier paste
    // test only checked the bytes landed, and the image still did not display.
    const info = await page.evaluate(() => {
      const img = document.querySelector('.ProseMirror img') as HTMLImageElement | null
      return img ? { src: img.getAttribute('src'), loaded: img.naturalWidth > 0 } : null
    })
    expect(info?.loaded, `image did not load: ${JSON.stringify(info)}`).toBe(true)
    expect(info?.src).toContain('file://')

    // The markdown itself must stay relative, or the folder stops being portable.
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)
    const saved = await readFile(file, 'utf8')
    expect(saved).toContain('(assets/pic.png)')
    expect(saved).not.toContain('file://')
  })
})

describe('editor-owned Edit menu items still work when clicked', () => {
  it('Edit > Select All and Edit > Copy act on the document', async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('menu clipboard target')
    await page.waitForTimeout(300)

    // These accelerators are deliberately unbound so the keystrokes reach the
    // editor, but the menu items must still do something.
    await page.locator('.menubar__top', { hasText: /^Edit$/ }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    // Select All lives inside the Selection submenu, not at the top level.
    await page.locator('.menu__item', { hasText: 'Selection' }).first().click()
    await page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
    await page.locator('.menu--nested .menu__item', { hasText: 'Select All' }).first().click()
    await page.waitForTimeout(400)

    const selected = await page.evaluate(() => (window.getSelection()?.toString() ?? '').trim())
    expect(selected).toContain('menu clipboard target')
  })

  it('Edit > Undo reverts the last change', async () => {
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('End')
    await page.waitForTimeout(600)
    await page.keyboard.type(' EXTRA')
    await page.waitForTimeout(600)
    expect(await page.locator('.ProseMirror').innerText()).toContain('EXTRA')

    await page.locator('.menubar__top', { hasText: /^Edit$/ }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await page.locator('.menu[role="menu"] .menu__item', { hasText: 'Undo' }).first().click()
    await page.waitForTimeout(600)

    expect(await page.locator('.ProseMirror').innerText()).not.toContain('EXTRA')
  })
})

describe('documents are labelled by filename, not by path', () => {
  it('shows the bare filename in the window title and the tab', async () => {
    // This existed as a bug: the path split handled forward slashes only, so on
    // Windows every opened file was labelled with its entire path. 240 tests
    // passed because none of them looked at what was displayed.
    const file = join(workdir, 'labelled.md')
    await writeFile(file, '# Labelled\n', 'utf8')

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)
    await page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('Labelled') ?? false,
      { timeout: 15_000 }
    )

    // Not String.raw: a raw template cannot end in a backslash, since it would
    // escape its own closing backtick.
    const SEP = '\\'

    const title = await page.evaluate(() => document.title)
    expect(title).toContain('labelled.md')
    expect(title).not.toContain(SEP)
    expect(title).not.toContain('Temp')

    const tabs = await page.locator('.tab__name').allTextContents()
    expect(tabs.some((t) => t.trim() === 'labelled.md')).toBe(true)
    expect(tabs.every((t) => !t.includes(SEP))).toBe(true)
  })
})

describe('a renamed file keeps its tab', () => {
  it('follows the rename and relabels the tab', async () => {
    const { mkdir, rename } = await import('node:fs/promises')
    const dir = join(workdir, 'renames')
    await mkdir(dir, { recursive: true })
    const before = join(dir, 'before.md')
    const after = join(dir, 'after.md')
    await writeFile(before, '# Renamed document\n\nbody text\n', 'utf8')

    await page.evaluate((root) => window.api.workspace.set(root), dir)
    await page.waitForTimeout(800)

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, before)
    await page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('Renamed document') ?? false,
      { timeout: 15_000 }
    )
    expect(await page.evaluate(() => document.title)).toContain('before.md')

    // Rename it the way Explorer would, while the tab is open.
    await rename(before, after)

    // The tab should move to the new name rather than detaching.
    await page.waitForFunction(() => document.title.includes('after.md'), { timeout: 20_000 })

    const title = await page.evaluate(() => document.title)
    expect(title).toContain('after.md')
    expect(title).not.toContain('before.md')

    // And the content is still there, unsaved-work intact.
    expect(await page.locator('.ProseMirror').innerText()).toContain('body text')
  })
})

describe('Data Recovery restores the version kept before the last save', () => {
  it('offers the backup and puts it back in the editor', async () => {
    const file = join(workdir, 'recoverable.md')
    await writeFile(file, '# Original content\n\nthe good version\n', 'utf8')

    await app.evaluate(async ({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', path)
    }, file)
    await page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('the good version') ?? false,
      { timeout: 15_000 }
    )

    // Wreck it and save, which is what a bad save looks like from the user's
    // side. The pre-save bytes become the backup.
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('ruined')
    await page.waitForTimeout(400)
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1200)
    expect(await readFile(file, 'utf8')).toContain('ruined')

    // Help > Data Recovery, answering the confirm dialog with Restore.
    const restored = page.waitForFunction(
      () =>
        document.querySelector('.ProseMirror')?.textContent?.includes('the good version') ?? false,
      { timeout: 20_000 }
    )
    await app.evaluate(async ({ dialog }) => {
      // The prompt is a native dialog; answer it as the user would.
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    })
    await page.locator('.menubar__top', { hasText: /^Help$/ }).click()
    await page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await page.locator('.menu__item', { hasText: 'Data Recovery' }).first().click()

    await restored
    expect(await page.locator('.ProseMirror').innerText()).toContain('the good version')

    // Restoring does not touch the disk until the user saves.
    expect(await readFile(file, 'utf8')).toContain('ruined')
  })
})
