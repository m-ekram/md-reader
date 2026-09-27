import { describe, it, expect } from 'vitest'
import { describeError } from './report'

describe('describeError', () => {
  it('drops the IPC wrapping, which means nothing to a person', () => {
    const err = new Error(
      "Error invoking remote method 'file:read': Error: ENOENT: no such file or directory, open 'C:\\notes\\a.md'"
    )
    expect(describeError(err)).toBe("ENOENT: no such file or directory, open 'C:\\notes\\a.md'")
  })

  it('reads anything thrown, not only errors', () => {
    expect(describeError('plain text')).toBe('plain text')
  })
})
