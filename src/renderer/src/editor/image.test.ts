import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEditor, type EditorHandle } from './crepe'

/**
 * The regression guard for the worst content bug Phase 0 found.
 *
 * Upstream image-block parses `alt` as a number and writes it back as the
 * resize ratio, so `![alt text](p.png)` became `![1.00](p.png)` and every block
 * image silently lost its alt text the first time the file was saved.
 */
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

describe('block image alt text', () => {
  it('survives a round-trip', () => {
    expect(trip('![alt text](./img/pic.png)')).toBe('![alt text](./img/pic.png)')
  })

  it('is never replaced by a ratio', () => {
    // The precise failure: a number where the alt text used to be.
    expect(trip('![meaningful description](p.png)')).not.toMatch(/!\[[\d.]+\]/)
  })

  it('preserves multi-word and unicode alt text', () => {
    expect(trip('![a longer description here](x.png)')).toBe('![a longer description here](x.png)')
    expect(trip('![café 日本語](x.png)')).toBe('![café 日本語](x.png)')
  })

  it('keeps an empty alt empty rather than inventing a number', () => {
    expect(trip('![](./img/pic.png)')).toBe('![](./img/pic.png)')
  })

  it('preserves the title alongside the alt', () => {
    expect(trip('![alt here](p.png "A caption")')).toBe('![alt here](p.png "A caption")')
  })

  it('leaves inline images alone', () => {
    const md = 'Text with ![inline alt](p.png) inside a sentence.'
    expect(trip(md)).toBe(md)
  })

  it('handles several images in one document', () => {
    const md = '![first](a.png)\n\n![second](b.png)\n\n![third](c.png)'
    expect(trip(md)).toBe(md)
  })
})
