import { describe, expect, it } from 'vitest'
import { compileSearch, expandReplacement, findAll, replaceAllIn } from './text-search'

const re = (spec: Parameters<typeof compileSearch>[0]) => {
  const c = compileSearch(spec)
  if (!c.ok) throw new Error(c.error)
  return c.re
}
const matches = (text: string, spec: Parameters<typeof compileSearch>[0]) =>
  findAll(text, re(spec)).map((m) => text.slice(m.from, m.to))

describe('compileSearch', () => {
  it('takes plain text literally', () => {
    expect(matches('a.b axb a.b', { query: 'a.b' })).toEqual(['a.b', 'a.b'])
  })

  it('ignores case unless asked', () => {
    expect(matches('Note note NOTE', { query: 'note' })).toHaveLength(3)
    expect(matches('Note note NOTE', { query: 'note', caseSensitive: true })).toEqual(['note'])
  })

  it('matches whole words only when asked, accents and all', () => {
    expect(matches('café cafés un café.', { query: 'café', wholeWord: true })).toHaveLength(2)
    expect(matches('note notes denote', { query: 'note', wholeWord: true })).toEqual(['note'])
  })

  it('takes a regular expression, a line at a time for ^ and $', () => {
    expect(matches('# One\ntext\n## Two', { query: '^#+ (\\w+)$', regexp: true })).toEqual([
      '# One',
      '## Two',
    ])
  })

  it('says what is wrong with a pattern that will not compile', () => {
    const c = compileSearch({ query: 'a(b', regexp: true })
    expect(c.ok).toBe(false)
    if (!c.ok) expect(c.error).toMatch(/pattern/i)
  })

  it('has nothing to search for in an empty query', () => {
    expect(compileSearch({ query: '' }).ok).toBe(false)
  })
})

describe('findAll', () => {
  it('moves on past a match of nothing, rather than looping', () => {
    expect(findAll('abc', re({ query: 'x*', regexp: true }))).toHaveLength(4)
  })

  it('stops at a limit', () => {
    expect(findAll('aaaa', re({ query: 'a' }), 2)).toHaveLength(2)
  })
})

describe('expandReplacement', () => {
  const m = /(\w+)@(?<host>\w+)/.exec('ann@example')!

  it('fills in groups and the whole match for a regular expression', () => {
    expect(expandReplacement('$2/$1 ($&) $<host>', m, true)).toBe(
      'example/ann (ann@example) example'
    )
  })

  it('writes a dollar for $$, and nothing for a group that is not there', () => {
    expect(expandReplacement('$$1 $9', m, true)).toBe('$1 ')
  })

  it('takes the replacement literally for plain text', () => {
    expect(expandReplacement('$1 $&', m, false)).toBe('$1 $&')
  })
})

describe('replaceAllIn', () => {
  it('replaces every match and counts them', () => {
    expect(replaceAllIn('a-b-c', re({ query: '-' }), '+', false)).toEqual({
      text: 'a+b+c',
      count: 2,
    })
  })

  it('uses groups when the search is a regular expression', () => {
    expect(
      replaceAllIn(
        '[[Note]] and [[Other]]',
        re({ query: '\\[\\[(\\w+)\\]\\]', regexp: true }),
        '<$1>',
        true
      )
    ).toEqual({ text: '<Note> and <Other>', count: 2 })
  })
})
