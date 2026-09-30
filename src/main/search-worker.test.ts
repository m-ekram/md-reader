// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { findMatches, isMarkdown, looksBinary, shouldSkip } from './search-worker'

/**
 * The matching logic behind folder search. Listed in the Phase 2 plan as
 * required coverage and never written at the time — this closes that gap.
 */

describe('looksBinary', () => {
  it('detects a NUL byte', () => {
    expect(looksBinary(Buffer.from([0x68, 0x00, 0x69]))).toBe(true)
  })

  it('accepts ordinary text, including unicode', () => {
    expect(looksBinary(Buffer.from('# Heading\n\ncafé 日本語 🎉\n', 'utf8'))).toBe(false)
  })

  it('only sniffs the first few KB, so a huge file stays cheap', () => {
    // A NUL far past the sniff window is not worth scanning the whole file for.
    const buf = Buffer.concat([Buffer.alloc(8192, 0x61), Buffer.from([0x00])])
    expect(looksBinary(buf)).toBe(false)
  })

  it('handles an empty buffer', () => {
    expect(looksBinary(Buffer.alloc(0))).toBe(false)
  })
})

describe('shouldSkip', () => {
  const none = new Set<string>()

  it('skips dot-entries and known build folders', () => {
    expect(shouldSkip('.git', none)).toBe(true)
    expect(shouldSkip('.obsidian', none)).toBe(true)
    expect(shouldSkip('node_modules', none)).toBe(true)
  })

  it('skips whatever .gitignore named', () => {
    expect(shouldSkip('vendor', new Set(['vendor']))).toBe(true)
    expect(shouldSkip('vendor', none)).toBe(false)
  })

  it('keeps ordinary folders', () => {
    expect(shouldSkip('notes', none)).toBe(false)
  })
})

describe('isMarkdown', () => {
  it('matches the extensions search covers', () => {
    expect(isMarkdown('a.md')).toBe(true)
    expect(isMarkdown('A.MARKDOWN')).toBe(true)
    expect(isMarkdown('a.txt')).toBe(false)
  })
})

describe('findMatches', () => {
  const text = ['# Title', '', 'the needle is here', 'nothing', 'another needle line'].join('\n')

  it('says how many matches in the file come before each hit', () => {
    // So a click on a result can go to that match, not just open the file.
    const hits = findMatches('needle needle\nnone\na needle\nNEEDLE', 'needle')
    expect(hits.map((h) => h.ordinal)).toEqual([0, 2, 3])
  })

  it('reports one hit per matching line, with 1-indexed line numbers', () => {
    const hits = findMatches(text, 'needle')
    expect(hits).toHaveLength(2)
    expect(hits[0].line).toBe(3)
    expect(hits[1].line).toBe(5)
  })

  it('reports the column of the match', () => {
    const [hit] = findMatches(text, 'needle')
    expect(hit.column).toBe('the '.length)
  })

  it('is case-insensitive by default', () => {
    expect(findMatches(text, 'NEEDLE')).toHaveLength(2)
  })

  it('respects case when asked', () => {
    expect(findMatches(text, 'NEEDLE', { caseSensitive: true })).toHaveLength(0)
    expect(findMatches(text, 'needle', { caseSensitive: true })).toHaveLength(2)
  })

  it('returns nothing for a query that does not appear', () => {
    expect(findMatches(text, 'absent')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    // Otherwise every file in the folder would match everything.
    expect(findMatches(text, '')).toEqual([])
  })

  it('stops at the limit, which is how cancellation stays responsive', () => {
    const many = Array.from({ length: 50 }, (_, i) => `needle ${i}`).join('\n')
    expect(findMatches(many, 'needle', { limit: 10 })).toHaveLength(10)
  })

  it('truncates a very long preview rather than shipping the whole line', () => {
    const long = 'needle ' + 'x'.repeat(500)
    const [hit] = findMatches(long, 'needle')
    expect(hit.preview.length).toBeLessThan(260)
    expect(hit.preview.endsWith('…')).toBe(true)
  })

  it('handles CRLF files, which is most of them on Windows', () => {
    const crlf = '# Title\r\n\r\nthe needle is here\r\n'
    const [hit] = findMatches(crlf, 'needle')
    expect(hit.line).toBe(3)
    expect(hit.preview).not.toContain('\r')
  })

  it('matches across unicode content without mangling offsets', () => {
    const [hit] = findMatches('日本語 needle here', 'needle')
    expect(hit.line).toBe(1)
    expect(hit.preview).toContain('日本語')
  })
})
