import { describe, it, expect, beforeEach } from 'vitest'
import { forgetOwner, forgetPage, noteOwner, recoverableFor } from './journal-owners'

const entries = [
  { path: 'untitled:doc-a' },
  { path: 'C:\\notes\\b.md' },
  { path: 'untitled:doc-c' },
]
const alive = (ids: number[]) => (id: number) => ids.includes(id)

beforeEach(() => {
  for (const e of entries) forgetOwner(e.path)
})

describe('recoverableFor', () => {
  it('offers everything when no page owns anything: a fresh launch', () => {
    expect(recoverableFor(entries, 1, alive([1]))).toEqual(entries)
  })

  it('never offers one live window’s work to another', () => {
    noteOwner('untitled:doc-a', 1)
    noteOwner('C:\\notes\\b.md', 1)
    expect(recoverableFor(entries, 2, alive([1, 2]))).toEqual([{ path: 'untitled:doc-c' }])
  })

  it('gives a window back its own work, as after a renderer crash', () => {
    noteOwner('untitled:doc-a', 1)
    expect(recoverableFor(entries, 1, alive([1]))).toContainEqual({ path: 'untitled:doc-a' })
  })

  it('offers what a page that is gone left behind', () => {
    noteOwner('untitled:doc-a', 1)
    expect(recoverableFor(entries, 2, alive([2]))).toContainEqual({ path: 'untitled:doc-a' })
    forgetPage(1)
    expect(recoverableFor(entries, 2, alive([1, 2]))).toContainEqual({ path: 'untitled:doc-a' })
  })
})
