import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanForExport } from './clean'

/**
 * The fixture is the editor's real DOM, captured from a running application
 * rather than written by hand. Every previous library-shape bug in this project
 * came from writing against how something ought to look, and a hand-written
 * fixture would encode the same guess the code does — so it could only ever
 * confirm the guess.
 */
const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'editor-dom.html'), 'utf8')

describe('cleanForExport', () => {
  let cleaned: string
  let out: HTMLElement

  beforeEach(() => {
    const root = document.createElement('div')
    root.innerHTML = FIXTURE
    cleaned = cleanForExport(root)
    out = document.createElement('div')
    out.innerHTML = cleaned
  })

  it('keeps the document content', () => {
    expect(out.querySelector('h1')?.textContent).toContain('Heading')
    expect(out.querySelector('strong')?.textContent).toBe('bold')
    expect(out.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
  })

  it('turns the CodeMirror block into a plain pre/code', () => {
    const code = out.querySelector('pre > code')
    expect(code, 'a code fence must survive as pre/code').not.toBeNull()
    expect(code?.textContent).toBe('const x = 1')
    expect(code?.className).toBe('language-javascript')
  })

  it('keeps the code of a block that was out of sight', () => {
    // A code block starts CodeMirror only once it scrolls into view, and
    // until then holds a placeholder with the text. Read from CodeMirror
    // alone, every block below the fold exported empty.
    const root = document.createElement('div')
    root.innerHTML =
      '<div class="milkdown-code-block"><pre class="milkdown-code-block-placeholder"><code>const y = 2\nreturn y</code></pre></div>'
    const exported = document.createElement('div')
    exported.innerHTML = cleanForExport(root)
    expect(exported.querySelector('pre > code')?.textContent).toBe('const y = 2\nreturn y')
  })

  it('removes the code block toolbar along with it', () => {
    expect(cleaned).not.toContain('copy-button')
    expect(cleaned).not.toContain('language-picker')
    expect(cleaned).not.toContain('cm-content')
  })

  it('lifts list items out of their wrapper div', () => {
    const list = out.querySelector('ul')
    expect(list).not.toBeNull()
    // A div as a direct child of a ul is invalid HTML, and some renderers drop
    // its contents entirely rather than tolerating it.
    const directDivs = Array.from(list?.children ?? []).filter((c) => c.tagName === 'DIV')
    expect(directDivs).toHaveLength(0)
    expect(list?.querySelector('div'), 'item wrappers unwrapped too').toBeNull()
    // Four items: the two plain ones and the two tasks, which markdown parses
    // as a single list rather than two.
    expect(list?.querySelectorAll('li').length).toBe(4)
    expect(list?.textContent).toContain('one')
    expect(list?.textContent).toContain('two')
  })

  it('keeps the alert and the attribute that styles it', () => {
    const alert = out.querySelector('blockquote[data-alert="note"]')
    expect(alert, 'data-alert drives the alert styling and must survive').not.toBeNull()
    expect(alert?.textContent).toContain('An alert.')
  })

  it('keeps the real table and drops the empty scaffolding one', () => {
    const tables = out.querySelectorAll('table')
    for (const table of Array.from(tables)) {
      expect(table.querySelector('td, th'), 'no empty tables').not.toBeNull()
    }
    expect(out.textContent).toContain('1')
    expect(out.textContent).toContain('2')
  })

  it('exports task items as real checkboxes', () => {
    // The tick lives in the same wrapper as the ordinary bullet icon, and that
    // wrapper is furniture. Strip it first and a checked task exports as a
    // plain list item, losing the one thing that made it a task.
    const boxes = out.querySelectorAll('li.task-list-item input[type="checkbox"]')
    expect(boxes.length, 'both task items keep a checkbox').toBe(2)

    const checked = out.querySelectorAll('li input[type="checkbox"][checked]')
    expect(checked.length, 'the done item stays ticked').toBe(1)

    // A document, not a form.
    for (const box of Array.from(boxes)) {
      expect(box.hasAttribute('disabled')).toBe(true)
    }
    expect(out.textContent).toContain('open task')
    expect(out.textContent).toContain('done task')
  })

  it('removes editing affordances', () => {
    expect(cleaned).not.toContain('contenteditable')
    expect(cleaned).not.toContain('drag-handle')
    expect(cleaned).not.toContain('ProseMirror-widget')
    expect(cleaned).not.toContain('data-v-app')
  })

  it('leaves no editor class names behind', () => {
    for (const el of Array.from(out.querySelectorAll('*'))) {
      for (const cls of Array.from(el.classList)) {
        expect(cls, `${cls} is an editor class`).not.toMatch(/^(cm-|ProseMirror|milkdown-)/)
      }
    }
  })

  it('does not modify the element it was given', () => {
    const root = document.createElement('div')
    root.innerHTML = FIXTURE
    const before = root.innerHTML
    cleanForExport(root)
    // The live document is what the user is editing: a bug here must cost a
    // bad export, never their open file.
    expect(root.innerHTML).toBe(before)
  })
})
