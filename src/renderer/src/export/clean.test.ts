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
    expect(list?.querySelectorAll('li').length).toBe(2)
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
