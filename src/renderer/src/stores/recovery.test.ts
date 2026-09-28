import { describe, it, expect, beforeEach, vi } from 'vitest'

/** What each answer to the recovery question does with the work it offers. */

vi.mock('../editor/pool', () => ({ release: vi.fn(), setCapacity: vi.fn() }))

let recovery: typeof import('./recovery')
let docs: typeof import('./documents')
let discarded: string[]
let answers: Array<'restore' | 'later' | 'review' | 'discard'>

const pending = [
  { path: 'C:\\notes\\a.md', content: 'Recovered A', at: 1 },
  { path: 'untitled:doc-1234', content: 'Recovered draft\nsecond line', at: 2 },
]

beforeEach(async () => {
  vi.resetModules()
  discarded = []
  answers = []
  ;(window as unknown as { api: unknown }).api = {
    file: {
      pendingRecoveries: vi.fn(async () => pending),
      recoveryPrompt: vi.fn(async () => answers.shift() ?? 'later'),
      discardRecovery: vi.fn(async (p: string) => void discarded.push(p)),
      read: vi.fn(async (path: string) => ({
        path,
        content: 'On disk',
        encoding: 'utf8',
        hasBom: false,
        eol: '\n',
        mtimeMs: 1,
      })),
    },
  }
  recovery = await import('./recovery')
  docs = await import('./documents')
})

describe('the answer to "Unsaved changes were recovered"', () => {
  it('Not Now, and Escape, keep everything for next time', async () => {
    answers = ['later']
    await recovery.offerRecoveries()
    expect(discarded).toEqual([])
    expect(docs.useDocuments().docs).toEqual([])
  })

  it('Restore All brings everything back', async () => {
    answers = ['restore']
    await recovery.offerRecoveries()
    expect(docs.useDocuments().docs.map((d) => d.content)).toEqual([
      'Recovered A',
      'Recovered draft\nsecond line',
    ])
    expect(discarded).toEqual([])
  })

  it('Review asks about each, and only a Discard discards', async () => {
    answers = ['review', 'discard', 'later']
    await recovery.offerRecoveries()
    expect(discarded).toEqual(['C:\\notes\\a.md'])
    expect(docs.useDocuments().docs).toEqual([])
  })

  it('names an unsaved document by how it begins', () => {
    expect(recovery.recoveryLabel(pending[1])).toBe(
      'An unsaved document beginning “Recovered draft”'
    )
  })
})
