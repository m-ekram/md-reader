import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Dirty tracking and journal keys.
 *
 * Dirty tracking is what stops an untouched file being rewritten on save, and
 * the journal key is what lets an unsaved buffer be recovered after a crash.
 * Both are small enough to look obviously correct and important enough that
 * "obviously" is not good enough.
 */

// The store releases pooled editors when a document closes; the pool pulls in
// the whole editor stack, which this has no need for.
vi.mock('../editor/pool', () => ({ release: vi.fn() }))

let docs: typeof import('./documents')

beforeEach(async () => {
  vi.resetModules()
  docs = await import('./documents')
})

const someFile = (over: Partial<Parameters<typeof docs.adoptFile>[0]> = {}) => ({
  path: 'C:\\notes\\note.md',
  content: '# Heading\n',
  encoding: 'utf8' as const,
  hasBom: false,
  eol: '\n' as const,
  mtimeMs: 1000,
  ...over,
})

describe('dirty tracking', () => {
  it('a freshly opened document is clean', () => {
    const d = docs.adoptFile(someFile())
    expect(docs.isDirty(d)).toBe(false)
  })

  it('becomes dirty when the content diverges from what was saved', () => {
    const d = docs.adoptFile(someFile())
    d.content = '# Heading\n\nedited\n'
    expect(docs.isDirty(d)).toBe(true)
  })

  it('is clean again if the edit is reverted by hand', () => {
    // Gating saves on equality rather than on an "edited" flag means typing a
    // character and deleting it does not cause a rewrite.
    const d = docs.adoptFile(someFile())
    d.content = 'changed'
    d.content = '# Heading\n'
    expect(docs.isDirty(d)).toBe(false)
  })

  it('becomes dirty when its line endings change', () => {
    // A change that is written on the next save. Not counted, closing the
    // document dropped it without asking.
    const d = docs.adoptFile(someFile({ eol: '\n' }))
    d.eol = '\r\n'
    expect(docs.isDirty(d)).toBe(true)
    d.eol = '\n'
    expect(docs.isDirty(d)).toBe(false)
  })

  it('a new untitled document starts clean and empty', () => {
    const d = docs.newDoc()
    expect(d.content).toBe('')
    expect(docs.isDirty(d)).toBe(false)
  })

  it('a new document takes the line endings chosen for new documents, and is clean', async () => {
    const settings = (await import('./settings')).useSettingsStore()
    expect(docs.newDoc().eol).toBe('\r\n')

    settings.value.newFileEol = 'lf'
    const d = docs.newDoc()
    expect(d.eol).toBe('\n')
    expect(docs.isDirty(d)).toBe(false)
  })

  it('anyDirty reports across every open document', () => {
    docs.adoptFile(someFile())
    const b = docs.adoptFile(someFile({ path: 'C:\\notes\\b.md' }))
    expect(docs.anyDirty()).toBe(false)

    b.content = 'edited'
    expect(docs.anyDirty()).toBe(true)
  })
})

describe('journalKey', () => {
  it('uses the real path once a document has one', () => {
    const d = docs.adoptFile(someFile())
    expect(docs.journalKey(d)).toBe('C:\\notes\\note.md')
  })

  it('uses a synthetic id for a buffer that was never saved', () => {
    // Without this an untitled document has no journal at all, which is the
    // case with the most to lose: there is no file to fall back on.
    const d = docs.newDoc()
    expect(docs.journalKey(d)).toMatch(/^untitled:/)
  })

  it('gives two untitled buffers different keys', () => {
    const a = docs.newDoc()
    const b = docs.newDoc()
    expect(docs.journalKey(a)).not.toBe(docs.journalKey(b))
  })
})

describe('document identity', () => {
  it('is stable across a Save As', () => {
    // Views key off the id, not the path. Reacting to the path would rebuild
    // the editor on Save As and throw away cursor position and undo history.
    const d = docs.newDoc()
    const before = d.id
    d.path = 'C:\\notes\\saved.md'
    d.name = 'saved.md'
    expect(d.id).toBe(before)
  })

  it('is unique per document', () => {
    const ids = [docs.newDoc().id, docs.newDoc().id, docs.adoptFile(someFile()).id]
    expect(new Set(ids).size).toBe(3)
  })
})

describe('adoptFile', () => {
  it('focuses an already-open file rather than opening it twice', () => {
    const first = docs.adoptFile(someFile())
    const again = docs.adoptFile(someFile())
    expect(again).toBe(first)
    expect(docs.useDocuments().docs).toHaveLength(1)
  })

  it('matches paths case-insensitively, as Windows does', () => {
    const first = docs.adoptFile(someFile({ path: 'C:\\Notes\\Note.md' }))
    const again = docs.adoptFile(someFile({ path: 'c:\\notes\\note.md' }))
    expect(again).toBe(first)
  })

  it('carries the file format through, so a save can reproduce it', () => {
    const d = docs.adoptFile(
      someFile({ encoding: 'utf16le', hasBom: true, eol: '\r\n', mtimeMs: 42 })
    )
    expect(d.encoding).toBe('utf16le')
    expect(d.hasBom).toBe(true)
    expect(d.eol).toBe('\r\n')
    expect(d.mtimeMs).toBe(42)
  })

  it('names the document after its file', () => {
    expect(docs.adoptFile(someFile()).name).toBe('note.md')
  })
})

describe('closing', () => {
  it('removes the document and keeps the active index in range', () => {
    docs.adoptFile(someFile({ path: 'C:\\a.md' }))
    docs.adoptFile(someFile({ path: 'C:\\b.md' }))
    const state = docs.useDocuments()
    expect(state.docs).toHaveLength(2)

    docs.closeDoc(1)
    expect(state.docs).toHaveLength(1)
    expect(state.activeIndex).toBe(0)
  })

  it('leaves no active document when the last one closes', () => {
    docs.adoptFile(someFile())
    docs.closeDoc(0)

    const state = docs.useDocuments()
    expect(state.docs).toHaveLength(0)
    expect(state.activeIndex).toBe(-1)
    expect(docs.activeDoc.value).toBeNull()
  })

  it('releases the closed document from the editor pool', async () => {
    const { release } = await import('../editor/pool')
    const d = docs.adoptFile(someFile())
    docs.closeDoc(0)
    expect(release).toHaveBeenCalledWith(d.id)
  })
})

describe('moveDoc', () => {
  it('moves a tab, keeping the same document in front', () => {
    docs.adoptFile(someFile({ path: 'C:\\a.md' }))
    docs.adoptFile(someFile({ path: 'C:\\b.md' }))
    docs.adoptFile(someFile({ path: 'C:\\c.md' }))
    docs.setActive(1)
    docs.moveDoc(0, 2)
    const s = docs.useDocuments()
    expect(s.docs.map((d) => d.name)).toEqual(['b.md', 'c.md', 'a.md'])
    expect(docs.activeDoc.value?.name).toBe('b.md')
  })

  it('ignores a move to where it is, or out of range', () => {
    docs.adoptFile(someFile({ path: 'C:\\a.md' }))
    docs.adoptFile(someFile({ path: 'C:\\b.md' }))
    docs.moveDoc(1, 1)
    docs.moveDoc(0, 5)
    expect(docs.useDocuments().docs.map((d) => d.name)).toEqual(['a.md', 'b.md'])
  })
})
