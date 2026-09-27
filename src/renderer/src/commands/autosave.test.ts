import { describe, it, expect, vi } from 'vitest'
import type { Doc } from '../stores/documents'

/** Which documents auto-save may write without asking anyone. */

// The module saves through the command layer, which pulls in the whole editor
// stack; deciding what may be saved needs none of it.
vi.mock('./app-commands', () => ({ saveInPlace: vi.fn() }))
vi.mock('../editor/pool', () => ({ flushAll: vi.fn(), release: vi.fn(), setCapacity: vi.fn() }))

const { autoSavable } = await import('./autosave')

const doc = (over: Partial<Doc> = {}): Doc => ({
  id: 'doc-1',
  path: 'C:\\notes\\a.md',
  name: 'a.md',
  content: 'edited',
  savedContent: 'saved',
  encoding: 'utf8',
  hasBom: false,
  eol: '\n',
  mtimeMs: 100,
  lossy: { lossy: false, note: '' },
  sourceMode: false,
  detached: false,
  readonly: false,
  reloadToken: 0,
  ...over,
})

describe('what auto-save may write', () => {
  it('an edited document with a file', () => {
    expect(autoSavable(doc(), new Map())).toBe(true)
  })

  it('nothing unedited, and nothing without a file to write to', () => {
    expect(autoSavable(doc({ content: 'saved' }), new Map())).toBe(false)
    expect(autoSavable(doc({ path: null }), new Map())).toBe(false)
  })

  it('not a Help topic, a readonly document, or one whose file has gone', () => {
    expect(autoSavable(doc({ helpTopic: 'keys' }), new Map())).toBe(false)
    expect(autoSavable(doc({ readonly: true }), new Map())).toBe(false)
    expect(autoSavable(doc({ detached: true }), new Map())).toBe(false)
  })

  it('not a document the round-trip guard warned would lose something', () => {
    expect(autoSavable(doc({ lossy: { lossy: true, note: 'x' } }), new Map())).toBe(false)
  })

  it('not one held after a conflict, until the user saves or reloads it', () => {
    const held = new Map([['doc-1', 100]])
    expect(autoSavable(doc(), held)).toBe(false)
    // Saving or reloading moves the file time, which ends the hold.
    expect(autoSavable(doc({ mtimeMs: 200 }), held)).toBe(true)
  })
})
