import { describe, it, expect, afterEach } from 'vitest'
import { acquire, release, releaseAll, liveIds, setCapacity, size, has } from './pool'

/**
 * The pool exists so undo history survives a tab switch. These assertions cover
 * the identity and lifetime rules that make that true; the end-to-end proof
 * that Ctrl+Z still works after switching tabs lives in the e2e suite.
 */
const noop = () => {}

afterEach(async () => {
  await releaseAll()
  setCapacity(5)
})

describe('editor pool', () => {
  it('returns the same editor for a document rather than rebuilding it', async () => {
    const a = await acquire({ id: 'doc-1', getContent: () => '# one', onChange: noop })
    const b = await acquire({ id: 'doc-1', getContent: () => '# one', onChange: noop })
    expect(b).toBe(a)
    expect(b.handle).toBe(a.handle)
  }, 30_000)

  it('never re-reads content for a cached editor', async () => {
    let reads = 0
    const getContent = () => {
      reads++
      return '# one'
    }
    await acquire({ id: 'doc-1', getContent, onChange: noop })
    await acquire({ id: 'doc-1', getContent, onChange: noop })
    await acquire({ id: 'doc-1', getContent, onChange: noop })
    // Re-reading would reset the editor and discard in-flight edits with it.
    expect(reads).toBe(1)
  }, 30_000)

  it('gives each document its own detached element', async () => {
    const a = await acquire({ id: 'doc-1', getContent: () => 'a', onChange: noop })
    const b = await acquire({ id: 'doc-2', getContent: () => 'b', onChange: noop })
    expect(a.el).not.toBe(b.el)
    expect(size()).toBe(2)
  }, 30_000)

  it('evicts the least recently used editor past the cap', async () => {
    setCapacity(2)
    await acquire({ id: 'doc-1', getContent: () => '1', onChange: noop })
    await acquire({ id: 'doc-2', getContent: () => '2', onChange: noop })
    // Touch doc-1 so doc-2 becomes the least recently used.
    await acquire({ id: 'doc-1', getContent: () => '1', onChange: noop })
    await acquire({ id: 'doc-3', getContent: () => '3', onChange: noop })

    expect(size()).toBe(2)
    expect(has('doc-2')).toBe(false)
    expect(liveIds().sort()).toEqual(['doc-1', 'doc-3'])
  }, 30_000)

  it('rebuilds an evicted document from its current content', async () => {
    setCapacity(1)
    await acquire({ id: 'doc-1', getContent: () => 'original', onChange: noop })
    await acquire({ id: 'doc-2', getContent: () => 'other', onChange: noop })
    expect(has('doc-1')).toBe(false)

    let rebuiltFrom = ''
    await acquire({
      id: 'doc-1',
      getContent: () => {
        rebuiltFrom = 'edited since'
        return rebuiltFrom
      },
      onChange: noop,
    })
    // Content comes from the store, so eviction costs undo history but no text.
    expect(rebuiltFrom).toBe('edited since')
    expect(has('doc-1')).toBe(true)
  }, 30_000)

  it('releases a closed document', async () => {
    await acquire({ id: 'doc-1', getContent: () => 'a', onChange: noop })
    await release('doc-1')
    expect(has('doc-1')).toBe(false)
    expect(size()).toBe(0)
  }, 30_000)

  it('lowering the cap evicts immediately', async () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      await acquire({ id, getContent: () => id, onChange: noop })
    }
    expect(size()).toBe(4)
    setCapacity(2)
    await new Promise((r) => setTimeout(r, 50))
    expect(size()).toBeLessThanOrEqual(2)
  }, 30_000)
})
