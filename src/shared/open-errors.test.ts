import { describe, it, expect } from 'vitest'
import { explainOpenError } from './open-errors'

const ipc = (inner: string) =>
  new Error(`Error invoking remote method 'file:read': Error: ${inner}`)

describe('why a file did not open', () => {
  it('names the file and says it is gone, not ENOENT', () => {
    const text = explainOpenError(
      'C:\\notes\\old.md',
      ipc("ENOENT: no such file or directory, open 'C:\\notes\\old.md'")
    )
    expect(text).toBe(
      'Could not open “old.md”: it is no longer there. It may have been moved, renamed or deleted.'
    )
  })

  it('tells a lock from a permission', () => {
    expect(explainOpenError('/n/a.md', ipc('EBUSY: resource busy'))).toContain('another program')
    expect(explainOpenError('/n/a.md', ipc('EACCES: permission denied'))).toContain('permission')
  })

  it('says something plain for anything else', () => {
    expect(explainOpenError('a.md', new Error('boom'))).toBe(
      'Could not open “a.md”: it could not be read.'
    )
  })
})
