import { describe, expect, it } from 'vitest'
import { diffLines } from './line-diff'

const show = (a: string, b: string) =>
  diffLines(a, b)?.map((l) => `${l.kind === 'same' ? ' ' : l.kind === 'add' ? '+' : '-'}${l.text}`)

describe('diffLines', () => {
  it('marks lines taken out and put in, and keeps the rest', () => {
    expect(show('one\ntwo\nthree', 'one\n2\nthree')).toEqual([' one', '-two', '+2', ' three'])
  })

  it('handles text added at the end and taken from the start', () => {
    expect(show('a\nb', 'b\nc')).toEqual(['-a', ' b', '+c'])
  })

  it('says nothing changed when nothing did', () => {
    expect(show('same\ntext', 'same\ntext')).toEqual([' same', ' text'])
  })

  it('gives up on a comparison too large to make quickly', () => {
    // Different all the way through: nothing shared at either end to trim.
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`)
    expect(diffLines(lines.join('\n'), [...lines].reverse().join('\n'), 1_000_000)).toBeNull()
  })

  it('compares a long text changed in one place without giving up', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`)
    const changed = [...lines]
    changed[2500] = 'changed'
    const diff = diffLines(lines.join('\n'), changed.join('\n'), 1_000_000)!
    expect(diff.filter((l) => l.kind !== 'same')).toEqual([
      { kind: 'del', text: 'line 2500' },
      { kind: 'add', text: 'changed' },
    ])
  })
})
