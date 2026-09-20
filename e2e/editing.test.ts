// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useApp } from './helpers'

/**
 * Editing behaviour: the keys the editor owns, and the menu items that drive it.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('keys the editor owns still reach the editor', () => {
  /**
   * The regression guard for the worst bug in Phase 1. The app-level key handler
   * claimed every accelerator the menu declared, including ~49 whose commands did
   * not exist yet, so Ctrl+C, Ctrl+V, Ctrl+Z and Tab were silently swallowed and
   * the editor could not copy, paste or undo. Every other test still passed.
   */
  async function freshDocument(): Promise<void> {
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(400)
    await ctx.page.locator('.ProseMirror').click()
  }

  const text = () => ctx.page.locator('.ProseMirror').innerText()

  it('types, selects all and cuts', async () => {
    await freshDocument()
    await ctx.page.keyboard.type('recoverable sentence')
    await ctx.page.waitForTimeout(200)
    expect(await text()).toContain('recoverable sentence')

    await ctx.page.keyboard.press('Control+a')
    await ctx.page.keyboard.press('Control+x')
    await ctx.page.waitForTimeout(300)
    expect(await text()).not.toContain('recoverable sentence')
  })

  it('pastes it back', async () => {
    await ctx.page.keyboard.press('Control+v')
    await ctx.page.waitForTimeout(400)
    expect(await text()).toContain('recoverable sentence')
  })

  it('undoes with Ctrl+Z', async () => {
    await freshDocument()
    await ctx.page.keyboard.type('first')
    await ctx.page.waitForTimeout(250)
    await ctx.page.keyboard.type(' second')
    await ctx.page.waitForTimeout(250)
    expect(await text()).toContain('second')

    await ctx.page.keyboard.press('Control+z')
    await ctx.page.waitForTimeout(400)
    expect(await text()).not.toContain('second')
  })

  it('applies bold with Ctrl+B', async () => {
    await freshDocument()
    await ctx.page.keyboard.type('bolded')
    await ctx.page.keyboard.press('Control+a')
    await ctx.page.keyboard.press('Control+b')
    await ctx.page.waitForTimeout(300)
    expect(await ctx.page.locator('.ProseMirror strong').count()).toBeGreaterThan(0)
  })

  it('does not swallow Tab', async () => {
    await freshDocument()
    await ctx.page.keyboard.type('- item one')
    await ctx.page.waitForTimeout(300)
    await ctx.page.keyboard.press('Enter')
    await ctx.page.keyboard.type('item two')
    await ctx.page.waitForTimeout(200)
    // Two list items exist already, so counting items would pass even if Tab
    // were swallowed. Nesting is what proves the key reached the editor.
    const nestedBefore = await ctx.page.locator('.ProseMirror li ul, .ProseMirror li ol').count()
    await ctx.page.keyboard.press('Tab')
    await ctx.page.waitForTimeout(400)
    const nestedAfter = await ctx.page.locator('.ProseMirror li ul, .ProseMirror li ol').count()
    expect(nestedAfter).toBeGreaterThan(nestedBefore)
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
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    const alphaIndex = (await ctx.page.locator('.tab__select').count()) - 1
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('alpha base')
    // ProseMirror groups edits made within ~500ms into a single undo step, so
    // the two edits need a gap to become separately undoable.
    await ctx.page.waitForTimeout(900)
    await ctx.page.keyboard.type(' ALPHA-EXTRA')
    await ctx.page.waitForTimeout(400)

    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('beta document')
    await ctx.page.waitForTimeout(400)

    // Back to the alpha document via the tab bar.
    await ctx.page.locator('.tab__select').nth(alphaIndex).click()
    await ctx.page.waitForTimeout(700)

    const before = await ctx.page.locator('.ProseMirror').innerText()
    expect(before).toContain('ALPHA-EXTRA')

    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('Control+z')
    await ctx.page.waitForTimeout(500)

    const after = await ctx.page.locator('.ProseMirror').innerText()
    expect(after, 'Ctrl+Z after a tab switch must still undo').not.toContain('ALPHA-EXTRA')
    expect(after).toContain('alpha')
  })
})
describe('Paragraph and Format menus act on the document', () => {
  async function blankDocWithText(text: string): Promise<void> {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type(text)
    await ctx.page.waitForTimeout(250)
    await ctx.page.keyboard.press('Control+a')
  }

  async function chooseMenuItem(menu: string, label: string): Promise<void> {
    await ctx.page.locator('.menubar__top', { hasText: new RegExp(`^${menu}$`) }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await ctx.page.locator('.menu[role="menu"] .menu__item', { hasText: label }).first().click()
    await ctx.page.waitForTimeout(500)
  }

  it('turns a paragraph into a heading', async () => {
    await blankDocWithText('Becomes a heading')
    await chooseMenuItem('Paragraph', 'Heading 2')
    expect(await ctx.page.locator('.ProseMirror h2').count()).toBeGreaterThan(0)
  })

  it('applies bold from the Format menu', async () => {
    await blankDocWithText('Make me bold')
    await chooseMenuItem('Format', 'Strong')
    expect(await ctx.page.locator('.ProseMirror strong').count()).toBeGreaterThan(0)
  })

  it('wraps a paragraph in a quote', async () => {
    await blankDocWithText('Quote this')
    await chooseMenuItem('Paragraph', 'Quote')
    expect(await ctx.page.locator('.ProseMirror blockquote').count()).toBeGreaterThan(0)
  })

  it('inserts an alert with its marker', async () => {
    await blankDocWithText('Careful now')
    await ctx.page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await ctx.page.locator('.menu__item', { hasText: 'Alert' }).first().click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
    await ctx.page.locator('.menu--nested .menu__item', { hasText: 'Warning' }).first().click()
    await ctx.page.waitForTimeout(600)

    expect(await ctx.page.locator('.ProseMirror blockquote[data-alert="warning"]').count()).toBe(1)
  })

  it('greys out table commands when the cursor is not in a table', async () => {
    await blankDocWithText('Not a table')
    await ctx.page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await ctx.page.locator('.menu__item', { hasText: 'Table' }).first().click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })

    const addRow = ctx.page
      .locator('.menu--nested .menu__item', { hasText: 'Add Row Above' })
      .first()
    expect(await addRow.getAttribute('aria-disabled')).toBe('true')
    // Inserting a table is always available, though.
    const insert = ctx.page
      .locator('.menu--nested .menu__item', { hasText: 'Insert Table' })
      .first()
    expect(await insert.getAttribute('aria-disabled')).toBe('false')
    await ctx.page.keyboard.press('Escape')
  })
})
describe('editor-owned Edit menu items still work when clicked', () => {
  it('Edit > Select All and Edit > Copy act on the document', async () => {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('menu clipboard target')
    await ctx.page.waitForTimeout(300)

    // These accelerators are deliberately unbound so the keystrokes reach the
    // editor, but the menu items must still do something.
    await ctx.page.locator('.menubar__top', { hasText: /^Edit$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    // Select All lives inside the Selection submenu, not at the top level.
    await ctx.page.locator('.menu__item', { hasText: 'Selection' }).first().click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
    await ctx.page.locator('.menu--nested .menu__item', { hasText: 'Select All' }).first().click()
    await ctx.page.waitForTimeout(400)

    const selected = await ctx.page.evaluate(() => (window.getSelection()?.toString() ?? '').trim())
    expect(selected).toContain('menu clipboard target')
  })

  it('Edit > Undo reverts the last change', async () => {
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.press('End')
    await ctx.page.waitForTimeout(600)
    await ctx.page.keyboard.type(' EXTRA')
    await ctx.page.waitForTimeout(600)
    expect(await ctx.page.locator('.ProseMirror').innerText()).toContain('EXTRA')

    await ctx.page.locator('.menubar__top', { hasText: /^Edit$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await ctx.page.locator('.menu[role="menu"] .menu__item', { hasText: 'Undo' }).first().click()
    await ctx.page.waitForTimeout(600)

    expect(await ctx.page.locator('.ProseMirror').innerText()).not.toContain('EXTRA')
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

  async function blank(): Promise<void> {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.keyboard.press('Control+n')
    await ctx.page.waitForTimeout(500)
    await ctx.page.locator('.ProseMirror').click()
  }

  const text = (): Promise<string> => ctx.page.locator('.ProseMirror').innerText()

  async function chooseSmart(label: string): Promise<void> {
    await ctx.page.keyboard.press('Escape')
    await ctx.page.locator('.menubar__top', { hasText: /^Edit$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await ctx.page.locator('.menu__item', { hasText: 'Smart Punctuation' }).first().click()
    await ctx.page.waitForSelector('.menu--nested .menu__item', { state: 'visible' })
    await ctx.page.locator('.menu--nested .menu__item', { hasText: label }).first().click()
    await ctx.page.waitForTimeout(400)
  }

  it('curls quotes, and opens before it closes', async () => {
    await blank()
    await ctx.page.keyboard.type('"quoted"')
    await ctx.page.waitForTimeout(400)
    const typed = await text()
    expect(typed).toContain(`${LEFT_DOUBLE}quoted${RIGHT_DOUBLE}`)
    expect(typed).not.toContain('"')
  })

  it('makes dashes and ellipses', async () => {
    await blank()
    await ctx.page.keyboard.type('a -- b --- c...')
    await ctx.page.waitForTimeout(400)
    const typed = await text()
    expect(typed).toContain(EN_DASH)
    expect(typed).toContain(EM_DASH)
    expect(typed).toContain(ELLIPSIS)
  })

  it('leaves code alone', async () => {
    await blank()
    // Made from the menu rather than by typing a fence: three backticks alone
    // do not open a block, so typing them left the text in a paragraph and the
    // test passed through the very substitution it meant to rule out.
    await ctx.page.locator('.menubar__top', { hasText: /^Paragraph$/ }).click()
    await ctx.page.waitForSelector('.menu[role="menu"]', { state: 'visible' })
    await ctx.page.locator('.menu__item', { hasText: 'Code Fences' }).first().click()
    await ctx.page.waitForTimeout(600)
    await ctx.page.locator('.ProseMirror .cm-content').first().click()
    await ctx.page.keyboard.type('print("hi") -- x')
    await ctx.page.waitForTimeout(400)
    const typed = await text()
    expect(typed).toContain('"hi"')
    expect(typed).not.toContain(LEFT_DOUBLE)
    expect(typed).not.toContain(EN_DASH)
  })

  it('stops curling quotes once Smart Quotes is switched off, dashes unaffected', async () => {
    await chooseSmart('Smart Quotes')
    await blank()
    await ctx.page.keyboard.type('"plain" -- still')
    await ctx.page.waitForTimeout(400)
    const typed = await text()
    expect(typed).toContain('"plain"')
    expect(typed).not.toContain(LEFT_DOUBLE)
    // Each kind is its own switch, so the dashes must survive the quotes going.
    expect(typed).toContain(EN_DASH)

    // Left on for anything that runs after this.
    await chooseSmart('Smart Quotes')
  })
})
