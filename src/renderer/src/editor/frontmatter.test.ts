import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { parserCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core'
import { frontmatterPlugin } from './frontmatter'
import { SERIALIZER_OPTIONS } from './crepe'
import { checkRoundTrip } from './roundtrip'

/**
 * Phase 0 found that front matter is destroyed without a node to hold it:
 *   ---\ntitle: Test\n---   became   ***\n\ntitle: Test\n-------------
 * These assertions are the proof that the fix works, and the regression guard
 * that keeps it working.
 */
let crepe: Crepe
let root: HTMLElement

const trip = (md: string): string => {
  let out = ''
  crepe.editor.action((ctx) => {
    const doc = ctx.get(parserCtx)(md)
    if (!doc) throw new Error('parse returned null')
    out = ctx.get(serializerCtx)(doc)
  })
  return out
}

beforeAll(async () => {
  root = document.createElement('div')
  document.body.appendChild(root)
  crepe = new Crepe({
    root,
    defaultValue: '',
    features: {
      [CrepeFeature.AI]: false,
      [CrepeFeature.TopBar]: false,
      [CrepeFeature.ImageBlock]: false,
    },
  })
  crepe.editor
    .config((ctx) => {
      const prev = ctx.get(remarkStringifyOptionsCtx)
      ctx.set(remarkStringifyOptionsCtx, { ...prev, ...SERIALIZER_OPTIONS })
    })
    .use(frontmatterPlugin)
  await crepe.create()
}, 60_000)

afterAll(async () => {
  await crepe?.destroy()
  root?.remove()
})

describe('YAML front matter', () => {
  it('survives a round-trip intact', () => {
    const md = '---\ntitle: Test\ntags: [a, b]\n---\n\nBody text.'
    expect(trip(md).trim()).toBe(md)
  })

  it('preserves nested and multi-line YAML', () => {
    const md =
      '---\ntitle: A Note\nauthor:\n  name: Ekram\n  email: x@y.z\ndraft: false\n---\n\n# Heading'
    expect(trip(md).trim()).toBe(md)
  })

  it('preserves an empty front matter block', () => {
    const md = '---\n---\n\nBody.'
    expect(trip(md).trim()).toBe(md)
  })

  it('does not invent front matter where there is none', () => {
    const md = '# Just a heading\n\nWith a paragraph.'
    expect(trip(md).trim()).toBe(md)
  })

  it('leaves a mid-document thematic break alone', () => {
    const md = 'Before\n\n---\n\nAfter'
    expect(trip(md).trim()).toBe(md)
  })
})

describe('round-trip guard', () => {
  it('stays quiet when a document round-trips cleanly', () => {
    const md = '---\ntitle: Test\n---\n\nBody text.'
    const r = checkRoundTrip(md, trip(md))
    expect(r.lossy).toBe(false)
  })

  it('names front matter as the likely cause when one is lossy', () => {
    const r = checkRoundTrip('---\ntitle: T\n---\n\nx', '***\n\ntitle: T\n\nx')
    expect(r.lossy).toBe(true)
    expect(r.note).toContain('YAML front matter')
    expect(r.firstDiffLine).toBe(1)
  })

  it('names image alt text when a block image is present', () => {
    const r = checkRoundTrip('![alt text](p.png)', '![1.00](p.png)')
    expect(r.lossy).toBe(true)
    expect(r.note).toContain('image alt text')
  })
})
