// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  chooseMenu,
  menuItem,
  newDocument,
  nextFrames,
  openFile,
  useApp,
  waitForText,
} from './helpers'

/**
 * Editing behaviour: the keys the editor owns, and the menu items that drive it.
 *
 * Waits are conditions, not durations: each action is followed by polling for
 * its visible effect. The one deliberate pause left is an undo-grouping gap,
 * which is a real property of the editor rather than a guess at how long
 * something takes.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

const text = (): Promise<string> => ctx.page.locator('.ProseMirror').innerText()

/**
 * ProseMirror merges edits made within ~500 ms into one undo step. Tests that
 * need two separately undoable edits have to leave a real gap between them;
 * no condition can stand in for elapsed time here.
 */
const UNDO_GROUP_GAP_MS = 700

describe('keys the editor owns still reach the editor', () => {
  /**
   * The regression guard for the worst bug in Phase 1. The app-level key handler
   * claimed every accelerator the menu declared, including ~49 whose commands did
   * not exist yet, so Ctrl+C, Ctrl+V, Ctrl+Z and Tab were silently swallowed and
   * the editor could not copy, paste or undo. Every other test still passed.
   */
  it('types, selects all and cuts', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('recoverable sentence')
    await expect.poll(text).toContain('recoverable sentence')

    await ctx.page.keyboard.press('Control+a')
    await ctx.page.keyboard.press('Control+x')
    await expect.poll(text).not.toContain('recoverable sentence')
  })

  it('pastes it back', async () => {
    await ctx.page.keyboard.press('Control+v')
    await expect.poll(text).toContain('recoverable sentence')
  })

  it('undoes with Ctrl+Z', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('first')
    await ctx.page.waitForTimeout(UNDO_GROUP_GAP_MS)
    await ctx.page.keyboard.type(' second')
    await expect.poll(text).toContain('second')

    await ctx.page.keyboard.press('Control+z')
    await expect.poll(text).not.toContain('second')
    expect(await text()).toContain('first')
  })

  it('applies bold with Ctrl+B', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('bolded')
    await ctx.page.keyboard.press('Control+a')
    await ctx.page.keyboard.press('Control+b')
    await expect.poll(() => ctx.page.locator('.ProseMirror strong').count()).toBeGreaterThan(0)
  })

  it('does not swallow Tab', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('- item one')
    await ctx.page.keyboard.press('Enter')
    await ctx.page.keyboard.type('item two')
    await expect.poll(() => ctx.page.locator('.ProseMirror li').count()).toBe(2)

    // Two list items exist already, so counting items would pass even if Tab
    // were swallowed. Nesting is what proves the key reached the editor.
    const nested = () => ctx.page.locator('.ProseMirror li ul, .ProseMirror li ol').count()
    const before = await nested()
    await ctx.page.keyboard.press('Tab')
    await expect.poll(nested).toBeGreaterThan(before)
  })
})

describe('undo history survives switching tabs', () => {
  /**
   * The reason the editor pool exists. Phase 1 rebuilt the editor on every
   * switch, so coming back to a tab found an empty undo stack and Ctrl+Z did
   * nothing — losing work the user assumed was recoverable.
   */
  it('undoes edits made before switching away and back', async () => {
    await newDocument(ctx)
    // Earlier tests leave their own tabs open, so address ours by index rather
    // than assuming this is the only document in the window.
    const alphaIndex = (await ctx.page.locator('.tab__select').count()) - 1
    await ctx.page.keyboard.type('alpha base')
    await ctx.page.waitForTimeout(UNDO_GROUP_GAP_MS)
    await ctx.page.keyboard.type(' ALPHA-EXTRA')
    await expect.poll(text).toContain('ALPHA-EXTRA')

    await newDocument(ctx)
    await ctx.page.keyboard.type('beta document')
    await expect.poll(text).toContain('beta document')

    // Back to the alpha document via the tab bar.
    await ctx.page.locator('.tab__select').nth(alphaIndex).click()
    await expect.poll(text).toContain('ALPHA-EXTRA')

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+z')
    await expect
      .poll(text, { message: 'Ctrl+Z after a tab switch must still undo' })
      .not.toContain('ALPHA-EXTRA')
    expect(await text()).toContain('alpha')
  })
})

describe('Paragraph and Format menus act on the document', () => {
  async function blankDocWithText(content: string): Promise<void> {
    await newDocument(ctx)
    await ctx.page.keyboard.type(content)
    await expect.poll(text).toContain(content)
    await ctx.page.keyboard.press('Control+a')
  }

  const count = (selector: string) => () => ctx.page.locator(selector).count()

  it('turns a paragraph into a heading', async () => {
    await blankDocWithText('Becomes a heading')
    await chooseMenu(ctx, 'Paragraph', 'Heading 2')
    await expect.poll(count('.ProseMirror h2')).toBeGreaterThan(0)
  })

  it('applies bold from the Format menu', async () => {
    await blankDocWithText('Make me bold')
    await chooseMenu(ctx, 'Format', 'Strong')
    await expect.poll(count('.ProseMirror strong')).toBeGreaterThan(0)
  })

  it('wraps a paragraph in a quote', async () => {
    await blankDocWithText('Quote this')
    await chooseMenu(ctx, 'Paragraph', 'Quote')
    await expect.poll(count('.ProseMirror blockquote')).toBeGreaterThan(0)
  })

  it('inserts an alert with its marker', async () => {
    await blankDocWithText('Careful now')
    await chooseMenu(ctx, 'Paragraph', 'Alert', 'Warning')
    await expect.poll(count('.ProseMirror blockquote[data-alert="warning"]')).toBe(1)
  })

  it('greys out table commands when the cursor is not in a table', async () => {
    await blankDocWithText('Not a table')
    const addRow = await menuItem(ctx, 'Paragraph', 'Table', 'Add Row Above')
    expect(await addRow.getAttribute('aria-disabled')).toBe('true')

    // Inserting a table is always available, though. Same submenu, still open.
    const insert = ctx.page
      .locator('.menu--nested .menu__item')
      .filter({ has: ctx.page.locator('.menu__label', { hasText: /^Insert Table…?$/ }) })
      .first()
    expect(await insert.getAttribute('aria-disabled')).toBe('false')
    await ctx.page.keyboard.press('Escape')
  })
})

describe('editor-owned Edit menu items still work when clicked', () => {
  it('Edit > Select All and Edit > Copy act on the document', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('menu clipboard target')
    await expect.poll(text).toContain('menu clipboard target')

    // These accelerators are deliberately unbound so the keystrokes reach the
    // editor, but the menu items must still do something. Select All lives
    // inside the Selection submenu, not at the top level.
    await chooseMenu(ctx, 'Edit', 'Selection', 'Select All')

    const selection = () =>
      ctx.page.evaluate(() => (window.getSelection()?.toString() ?? '').trim())
    await expect.poll(selection).toContain('menu clipboard target')
  })

  it('Edit > Undo reverts the last change', async () => {
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('End')
    // The previous test's typing must close its undo group first.
    await ctx.page.waitForTimeout(UNDO_GROUP_GAP_MS)
    await ctx.page.keyboard.type(' EXTRA')
    await expect.poll(text).toContain('EXTRA')

    await chooseMenu(ctx, 'Edit', 'Undo')
    await expect.poll(text).not.toContain('EXTRA')
  })
})

describe('smart punctuation substitutes while typing', () => {
  /**
   * Asserted on the rendered text rather than on the stored options, because
   * the options being true has never been the thing in doubt: what matters is
   * whether the character on screen changed.
   */
  const LEFT_DOUBLE = '“'
  const RIGHT_DOUBLE = '”'
  const EN_DASH = '–'
  const EM_DASH = '—'
  const ELLIPSIS = '…'

  it('curls quotes, and opens before it closes', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('"quoted"')
    await expect.poll(text).toContain(`${LEFT_DOUBLE}quoted${RIGHT_DOUBLE}`)
    expect(await text()).not.toContain('"')
  })

  it('makes dashes and ellipses', async () => {
    await newDocument(ctx)
    await ctx.page.keyboard.type('a -- b --- c...')
    await expect.poll(text).toContain(ELLIPSIS)
    const typed = await text()
    expect(typed).toContain(EN_DASH)
    expect(typed).toContain(EM_DASH)
  })

  it('leaves code alone', async () => {
    await newDocument(ctx)
    // Made from the menu rather than by typing a fence: three backticks alone
    // do not open a block, so typing them left the text in a paragraph and the
    // test passed through the very substitution it meant to rule out.
    await chooseMenu(ctx, 'Paragraph', 'Code Fences')
    await ctx.page.waitForSelector('.ProseMirror .cm-content', { timeout: 10_000 })
    await ctx.page.locator('.ProseMirror .cm-content').first().click()
    await ctx.page.keyboard.type('print("hi") -- x')

    await expect.poll(text).toContain('print("hi") -- x')
    const typed = await text()
    expect(typed).not.toContain(LEFT_DOUBLE)
    expect(typed).not.toContain(EN_DASH)
  })

  it('stops curling quotes once Smart Quotes is switched off, dashes unaffected', async () => {
    await chooseMenu(ctx, 'Edit', 'Smart Punctuation', 'Smart Quotes')
    await newDocument(ctx)
    await ctx.page.keyboard.type('"plain" -- still')

    await expect.poll(text).toContain('still')
    const typed = await text()
    expect(typed).toContain('"plain"')
    expect(typed).not.toContain(LEFT_DOUBLE)
    // Each kind is its own switch, so the dashes must survive the quotes going.
    expect(typed).toContain(EN_DASH)

    // Left on for anything that runs after this.
    await chooseMenu(ctx, 'Edit', 'Smart Punctuation', 'Smart Quotes')
  })
})

describe('copy as', () => {
  /**
   * Reading the clipboard can take over a second on Linux, where it goes
   * through the X server: longer than a poll allows by default, so the poll
   * gave up before its first read came back.
   */
  const CLIPBOARD_WAIT = { timeout: 10_000 }

  /** What the clipboard holds, as text and as HTML (empty when it has none). */
  const clipboard = () =>
    ctx.app.evaluate(async ({ clipboard: c }) => {
      const text = await c.readText()
      let html = ''
      for (const item of await c.read()) {
        if (item.types.includes('text/html'))
          html = await ((await item.getType('text/html')) as Blob).text()
      }
      return { text, html }
    })

  async function documentToCopy(): Promise<void> {
    const file = join(ctx.workdir, 'copy-as.md')
    await writeFile(
      file,
      'Plain **bold** end.\n\n**alone**\n\n```js\nconst code = 1\n```\n\nOther.\n',
      'utf8'
    )
    await openFile(ctx, file)
    await waitForText(ctx, 'Other.')
    await ctx.page.waitForSelector('.milkdown-code-block', { timeout: 15_000 })
  }

  it('copies clean HTML code, not the editor’s own markup', async () => {
    // It copied the editor's working DOM: node views, class names and all.
    await documentToCopy()
    await ctx.page.locator('.ProseMirror p', { hasText: 'Other.' }).click()
    await chooseMenu(ctx, 'Edit', 'Copy as HTML Code')
    await expect
      .poll(async () => (await clipboard()).text, CLIPBOARD_WAIT)
      .toContain('<strong>bold</strong>')
    const { text } = await clipboard()
    expect(text).toContain('const code = 1')
    expect(text).not.toContain('class="milkdown')
    expect(text).not.toContain('contenteditable')
  })

  /**
   * Selects the word that stands alone on its line, with Select Line.
   *
   * Not by double-click: on Windows that takes the space after the word. Not by
   * End and Shift+Home either: the page's selection moved, but now and then the
   * editor never took it up, and the command copied the whole document.
   */
  async function selectAlone(): Promise<void> {
    await ctx.page.locator('.ProseMirror p', { hasText: 'alone' }).click()
    await chooseMenu(ctx, 'Edit', 'Selection', 'Select Line')
    await expect.poll(() => ctx.page.evaluate(() => String(getSelection()))).toBe('alone')
  }

  /** The clipboard's text, with Windows' line endings made plain. */
  const clipboardText = async () => (await clipboard()).text.replace(/\r\n/g, '\n')

  it('copies just the selection as plain text', async () => {
    await selectAlone()
    await chooseMenu(ctx, 'Edit', 'Copy as Plain Text')
    await expect.poll(clipboardText, CLIPBOARD_WAIT).toBe('alone')
  })

  it('copies just the selection as markdown', async () => {
    await selectAlone()
    await chooseMenu(ctx, 'Edit', 'Copy as Markdown')
    await expect.poll(clipboardText, CLIPBOARD_WAIT).toBe('**alone**\n')
  })

  it('copies formatted text without the theme, for pasting elsewhere', async () => {
    // It copied markup as text, the same as HTML Code: pasted into a mail it
    // came out as tags.
    await ctx.page.locator('.ProseMirror p', { hasText: 'Other.' }).click()
    await chooseMenu(ctx, 'Edit', 'Copy without Theme Styling')
    await expect
      .poll(async () => (await clipboard()).html, CLIPBOARD_WAIT)
      .toContain('<strong>bold</strong>')
    const { html, text } = await clipboard()
    expect(html).not.toContain('class=')
    expect(html).not.toContain('style=')
    expect(text).toContain('Plain bold end.')
  })
})

describe('the placeholder', () => {
  it('invites writing in an empty document, and nowhere else', async () => {
    // Crepe's own "Please enter..." showed in every empty line the caret
    // reached, in the middle of documents too.
    await newDocument(ctx)
    await expect
      .poll(() =>
        ctx.page
          .locator('.ProseMirror .crepe-placeholder')
          .first()
          .getAttribute('data-placeholder')
          .catch(() => null)
      )
      .toBe('Start writing, or type / for blocks')

    await ctx.page.keyboard.type('Some text.')
    await ctx.page.keyboard.press('Enter')
    await nextFrames(ctx)
    expect(await ctx.page.locator('.ProseMirror .crepe-placeholder').count()).toBe(0)
  })
})
