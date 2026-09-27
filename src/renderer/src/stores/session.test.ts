import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings'

/**
 * The last session: what is kept of a window's documents, and what reopening
 * it does with files that have gone since.
 */

// The stores release and size pooled editors; the pool pulls in the whole
// editor stack, which this has no need for.
vi.mock('../editor/pool', () => ({ release: vi.fn(), setCapacity: vi.fn() }))

let session: typeof import('./session')
let docs: typeof import('./documents')
let settings: typeof import('./settings')

const onDisk = new Map<string, string>()

const file = (path: string) => ({
  path,
  content: onDisk.get(path)!,
  encoding: 'utf8' as const,
  hasBom: false,
  eol: '\n' as const,
  mtimeMs: 1,
})

beforeEach(async () => {
  vi.resetModules()
  onDisk.clear()
  ;(window as unknown as { api: unknown }).api = {
    file: {
      read: vi.fn(async (p: string) => {
        if (!onDisk.has(p)) throw new Error(`ENOENT: ${p}`)
        return file(p)
      }),
    },
  }
  session = await import('./session')
  docs = await import('./documents')
  settings = await import('./settings')
})

function lastSession(s: Partial<typeof DEFAULT_SETTINGS.session>): void {
  settings.useSettingsStore().value = {
    ...structuredClone(DEFAULT_SETTINGS),
    session: { ...DEFAULT_SETTINGS.session, ...s },
  }
}

describe('what a session keeps', () => {
  it('keeps saved files, in tab order, and which one is in front', () => {
    onDisk.set('C:\\a.md', 'A').set('C:\\b.md', 'B')
    docs.adoptFile(file('C:\\a.md'))
    docs.adoptFile(file('C:\\b.md'))
    docs.setActive(0)
    const s = docs.useDocuments()
    expect(session.sessionOf(s.docs, s.activeIndex)).toEqual({
      files: ['C:\\a.md', 'C:\\b.md'],
      active: 'C:\\a.md',
    })
  })

  it('leaves out Untitled documents and Help topics', () => {
    onDisk.set('C:\\a.md', 'A').set('C:\\help\\keys.md', 'Help')
    docs.adoptFile(file('C:\\a.md'))
    docs.adoptFile(file('C:\\help\\keys.md')).helpTopic = 'keys'
    docs.newDoc()
    const s = docs.useDocuments()
    // The Untitled one is in front, and there is nothing of it to reopen.
    expect(session.sessionOf(s.docs, s.activeIndex)).toEqual({
      files: ['C:\\a.md'],
      active: null,
    })
  })
})

describe('keeping it', () => {
  const patched = () =>
    (window.api.settings.patch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].session)

  beforeEach(() => {
    ;(window.api as unknown as { settings: unknown }).settings = {
      patch: vi.fn(async (p: object) => ({ ...settings.useSettingsStore().value, ...p })),
    }
  })

  it('keeps a file the window was launched with, though nothing changed after', async () => {
    lastSession({ files: [], active: null })
    onDisk.set('C:\\launched.md', 'L')
    docs.adoptFile(file('C:\\launched.md'))

    session.trackSession()
    await session.flushSession()
    expect(patched()).toEqual([
      expect.objectContaining({ files: ['C:\\launched.md'], active: 'C:\\launched.md' }),
    ])
  })

  it('leaves the session alone from a window that starts empty', async () => {
    // A New Window beside one with files open.
    lastSession({ files: ['C:\\other.md'], active: 'C:\\other.md' })

    session.trackSession()
    await session.flushSession()
    expect(patched()).toEqual([])
  })
})

describe('reopening it', () => {
  it('opens the files and puts the same one in front', async () => {
    onDisk.set('C:\\a.md', 'A').set('C:\\b.md', 'B')
    lastSession({ files: ['C:\\a.md', 'C:\\b.md'], active: 'c:\\A.md' })

    expect(await session.restoreSession()).toBe(true)
    expect(docs.useDocuments().docs.map((d) => d.path)).toEqual(['C:\\a.md', 'C:\\b.md'])
    expect(docs.activeDoc.value?.path).toBe('C:\\a.md')
  })

  it('skips files that have gone, and says so', async () => {
    onDisk.set('C:\\b.md', 'B')
    lastSession({ files: ['C:\\gone.md', 'C:\\b.md'], active: 'C:\\gone.md' })
    const { notice } = await import('./ui')

    expect(await session.restoreSession()).toBe(true)
    expect(docs.useDocuments().docs.map((d) => d.path)).toEqual(['C:\\b.md'])
    expect(notice.text).toContain('could not be found')
  })

  it('opens nothing when switched off', async () => {
    onDisk.set('C:\\a.md', 'A')
    lastSession({ restore: false, files: ['C:\\a.md'], active: null })

    expect(await session.restoreSession()).toBe(false)
    expect(docs.useDocuments().docs).toEqual([])
  })
})
