// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { directoryOf, isAbsoluteSrc, resolveAssetSrc, toFileUrl } from './assets'

// String.raw throughout: these are Windows paths, and an ordinary string
// literal turns `\notes` into a newline followed by "otes".
const NOTES = String.raw`C:\notes`
const NOTES_SUB = String.raw`C:\notes\sub`
// Not String.raw: a raw template cannot end in a backslash, because it would
// escape the closing backtick.
const NOTES_TRAILING = NOTES + '\\'

describe('isAbsoluteSrc', () => {
  it('leaves remote and inline sources alone', () => {
    for (const src of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'data:image/png;base64,AAAA',
      'blob:abc',
      'file:///C:/x.png',
      String.raw`C:\notes\a.png`,
      '//cdn/a.png',
    ]) {
      expect(isAbsoluteSrc(src), src).toBe(true)
    }
  })

  it('treats document-relative paths as relative', () => {
    expect(isAbsoluteSrc('assets/a.png')).toBe(false)
    expect(isAbsoluteSrc('./assets/a.png')).toBe(false)
    expect(isAbsoluteSrc('../shared/a.png')).toBe(false)
  })
})

describe('resolveAssetSrc', () => {
  it('resolves against the document directory', () => {
    expect(resolveAssetSrc('assets/pic.png', NOTES)).toBe('file:///C:/notes/assets/pic.png')
  })

  it('handles a leading ./', () => {
    expect(resolveAssetSrc('./assets/pic.png', NOTES)).toBe('file:///C:/notes/assets/pic.png')
  })

  it('walks up with ..', () => {
    expect(resolveAssetSrc('../shared/pic.png', NOTES_SUB)).toBe('file:///C:/notes/shared/pic.png')
  })

  it('encodes spaces and other awkward characters', () => {
    expect(resolveAssetSrc('assets/my pic.png', NOTES)).toBe('file:///C:/notes/assets/my%20pic.png')
  })

  it('never rewrites an absolute source', () => {
    expect(resolveAssetSrc('https://example.com/a.png', NOTES)).toBe('https://example.com/a.png')
    expect(resolveAssetSrc('data:image/png;base64,AAAA', NOTES)).toBe('data:image/png;base64,AAAA')
  })

  it('leaves the path alone when there is no document directory', () => {
    // An unsaved buffer: a wrong absolute path is worse than a relative one.
    expect(resolveAssetSrc('assets/pic.png', null)).toBe('assets/pic.png')
  })

  it('tolerates a trailing separator on the directory', () => {
    expect(resolveAssetSrc('a.png', NOTES_TRAILING)).toBe('file:///C:/notes/a.png')
  })
})

describe('toFileUrl', () => {
  it('keeps the drive letter unencoded', () => {
    expect(toFileUrl('C:/x/y.png')).toBe('file:///C:/x/y.png')
  })
})

describe('directoryOf', () => {
  it('returns the containing folder', () => {
    expect(directoryOf(String.raw`C:\notes\a.md`)).toBe(NOTES)
    expect(directoryOf('/home/u/a.md')).toBe('/home/u')
  })

  it('returns null for an unsaved document', () => {
    expect(directoryOf(null)).toBeNull()
  })
})
