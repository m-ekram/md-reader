import { describe, expect, it } from 'vitest'
import { countWords } from './words'

describe('countWords', () => {
  it('counts words between spaces', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('One two  three\nfour')).toBe(4)
    expect(countWords("don't well-known e.g.")).toBe(3)
  })

  it('counts each Chinese or Japanese character, since they are written without spaces', () => {
    expect(countWords('日本語')).toBe(3)
    expect(countWords('これは test です')).toBe(3 + 1 + 2)
    // Joined to Latin letters, both are still counted.
    expect(countWords('Unicode文字')).toBe(1 + 2)
  })

  it('leaves out markdown marks standing on their own', () => {
    // A heading's # or a list's - is not a word.
    expect(countWords('# Title\n\n- one\n- two\n\n---\n\n| a | b |')).toBe(5)
    expect(countWords('**bold** and `code`')).toBe(3)
  })

  it('counts numbers as words', () => {
    expect(countWords('Chapter 12, page 3.')).toBe(4)
  })

  it('keeps up with a long document', () => {
    const text = 'The quick brown fox jumps over the lazy dog.\n'.repeat(20_000)
    const start = performance.now()
    expect(countWords(text)).toBe(180_000)
    // Recounted each time typing pauses: it must stay well short of a frame
    // budget's worth of stalls. Generous for a loaded machine.
    expect(performance.now() - start).toBeLessThan(250)
  })
})
