import { describe, expect, it } from 'vitest'
import { currentHeading, reportCaret } from './caret'

const lines = [1, 5, 9]

describe('currentHeading', () => {
  it('takes the last heading at or above the caret line, in source view', () => {
    reportCaret('a', 'line', 7)
    expect(currentHeading('a', lines)).toBe(1)
    reportCaret('a', 'line', 9)
    expect(currentHeading('a', lines)).toBe(2)
  })

  it('has none before the first heading', () => {
    reportCaret('a', 'line', 0)
    expect(currentHeading('a', lines)).toBe(-1)
  })

  it('takes the formatted view’s count as it is, within the outline', () => {
    reportCaret('a', 'heading', 1)
    expect(currentHeading('a', lines)).toBe(1)
    reportCaret('a', 'heading', 7)
    expect(currentHeading('a', lines)).toBe(2)
  })

  it('says nothing about another document', () => {
    reportCaret('b', 'line', 9)
    expect(currentHeading('a', lines)).toBe(-1)
  })
})
