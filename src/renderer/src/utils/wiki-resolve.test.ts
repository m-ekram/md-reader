import { describe, expect, it } from 'vitest'
import { resolveWikiTarget, wikiCandidates } from './wiki-resolve'

const root = 'C:\\notes'
const file = (relativePath: string) => ({
  path: `${root}\\${relativePath.replace(/\//g, '\\')}`,
  relativePath,
})
const files = [
  file('Lisbon.md'),
  file('trips/Porto.md'),
  file('archive/Porto.md'),
  file('trips/deep/Faro.markdown'),
  file('Projects/Plan.md'),
]

describe('resolveWikiTarget', () => {
  it('finds a note by its name, without the extension, whatever the case', () => {
    expect(resolveWikiTarget('lisbon', `${root}\\index.md`, files)).toBe(`${root}\\Lisbon.md`)
    expect(resolveWikiTarget('Faro', `${root}\\index.md`, files)).toBe(
      `${root}\\trips\\deep\\Faro.markdown`
    )
  })

  it('takes a name written with its extension', () => {
    expect(resolveWikiTarget('Lisbon.md', `${root}\\index.md`, files)).toBe(`${root}\\Lisbon.md`)
  })

  it('takes a path, matched from the end', () => {
    expect(resolveWikiTarget('archive/Porto', `${root}\\index.md`, files)).toBe(
      `${root}\\archive\\Porto.md`
    )
    expect(resolveWikiTarget('deep/faro', `${root}\\index.md`, files)).toBe(
      `${root}\\trips\\deep\\Faro.markdown`
    )
  })

  it('prefers the note beside the one the link is in, then the shortest path', () => {
    expect(resolveWikiTarget('Porto', `${root}\\archive\\index.md`, files)).toBe(
      `${root}\\archive\\Porto.md`
    )
    expect(resolveWikiTarget('Porto', `${root}\\trips\\x.md`, files)).toBe(
      `${root}\\trips\\Porto.md`
    )
    // From elsewhere: the shorter path.
    expect(resolveWikiTarget('Porto', `${root}\\index.md`, files)).toBe(`${root}\\trips\\Porto.md`)
    // And between two as short, the first in order, the same each time.
    const tie = [file('b/Same.md'), file('a/Same.md')]
    expect(resolveWikiTarget('Same', `${root}\\index.md`, tie)).toBe(`${root}\\a\\Same.md`)
  })

  it('finds nothing for a name that is not there, or only part of one', () => {
    expect(resolveWikiTarget('Lis', `${root}\\index.md`, files)).toBeNull()
    expect(resolveWikiTarget('an/Plan', `${root}\\index.md`, files)).toBeNull()
  })
})

describe('wikiCandidates', () => {
  const from = `${root}\\index.md`

  it('ranks notes by how well their name fits what was typed', () => {
    const names = wikiCandidates('pl', from, files).map((c) => c.insert)
    expect(names[0]).toBe('Plan')
    expect(wikiCandidates('lsb', from, files).map((c) => c.insert)).toEqual(['Lisbon'])
  })

  it('lists every note, shortest path first, before anything is typed', () => {
    expect(wikiCandidates('', from, files).map((c) => c.insert)).toEqual([
      'Lisbon',
      'Porto',
      'archive/Porto',
      'Plan',
      'Faro',
    ])
  })

  it('writes a path only where the name alone would lead to another note', () => {
    // Every insert leads back to the note it was chosen for.
    for (const c of wikiCandidates('porto', from, files)) {
      expect(resolveWikiTarget(c.insert, from, files)).toBe(c.path)
    }
    expect(wikiCandidates('porto', from, files).map((c) => c.insert)).toEqual([
      'Porto',
      'archive/Porto',
    ])
    // From the archive, its own Porto is the bare name.
    expect(wikiCandidates('porto', `${root}\\archive\\x.md`, files).map((c) => c.insert)).toEqual([
      'Porto',
      'trips/Porto',
    ])
  })

  it('stops at a handful', () => {
    const many = Array.from({ length: 30 }, (_, i) => file(`n${i}.md`))
    expect(wikiCandidates('n', from, many)).toHaveLength(8)
  })
})
