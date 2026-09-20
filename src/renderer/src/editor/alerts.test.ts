import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEditor, type EditorHandle } from './crepe'
import { alertKindOf } from './alerts'

let handle: EditorHandle
let root: HTMLElement

beforeAll(async () => {
  root = document.createElement('div')
  document.body.appendChild(root)
  handle = await createEditor({ root, value: '', onChange: () => {} })
}, 60_000)

afterAll(async () => {
  await handle?.destroy()
  root?.remove()
})

const trip = (md: string) => handle.reserialize(md).trim()

describe('alertKindOf', () => {
  it('recognizes every GitHub alert kind, case-insensitively', () => {
    expect(alertKindOf('[!NOTE]')).toBe('note')
    expect(alertKindOf('[!TIP]')).toBe('tip')
    expect(alertKindOf('[!IMPORTANT]')).toBe('important')
    expect(alertKindOf('[!WARNING]')).toBe('warning')
    expect(alertKindOf('[!CAUTION]')).toBe('caution')
    expect(alertKindOf('[!note]')).toBe('note')
  })

  it('rejects anything that is not a marker', () => {
    expect(alertKindOf('Just text')).toBeNull()
    expect(alertKindOf('[!UNKNOWN]')).toBeNull()
    expect(alertKindOf('[NOTE]')).toBeNull()
    expect(alertKindOf('text [!NOTE] inline')).toBeNull()
  })
})

describe('alerts round-trip', () => {
  it('preserves a note without escaping the bracket', () => {
    const md = '> [!NOTE]\n> Useful information.'
    const out = trip(md)
    // The precise Phase 0 failure was an escaped bracket: `> \[!NOTE]`.
    expect(out).not.toContain(String.raw`\[`)
    expect(out).toBe(md)
  })

  for (const kind of ['TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
    it(`preserves a ${kind.toLowerCase()}`, () => {
      const md = `> [!${kind}]\n> Body text.`
      expect(trip(md)).toBe(md)
    })
  }

  it('preserves a multi-paragraph alert', () => {
    const md = '> [!WARNING]\n> First paragraph.\n>\n> Second paragraph.'
    expect(trip(md)).toBe(md)
  })

  it('leaves an ordinary blockquote untouched', () => {
    const md = '> Just a quote\n> over two lines'
    expect(trip(md)).toBe(md)
  })

  it('does not treat an unknown marker as an alert', () => {
    const md = '> \[!UNKNOWN]\n> Body.'
    expect(trip(md)).toContain('UNKNOWN')
  })

  it('does not duplicate the marker across repeated saves', () => {
    const md = '> [!NOTE]\n> Body.'
    expect(trip(trip(trip(md)))).toBe(md)
  })
})
