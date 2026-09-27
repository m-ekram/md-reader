import { describe, it, expect } from 'vitest'
import { newDoc } from './documents'
import { adoptFromDisk } from './external-changes'

describe('adoptFromDisk', () => {
  it('takes everything that describes the file, not only its text', () => {
    const doc = newDoc()
    doc.content = 'Unsaved edits.'
    const token = doc.reloadToken

    adoptFromDisk(doc, {
      path: 'C:\\notes\\a.md',
      content: 'From disk.\r\n',
      encoding: 'utf16le',
      hasBom: true,
      eol: '\r\n',
      mtimeMs: 1234,
    })

    // A reload over unsaved edits kept the old encoding and line endings, so
    // the next save rewrote the file in them.
    expect(doc).toMatchObject({
      content: 'From disk.\r\n',
      savedContent: 'From disk.\r\n',
      encoding: 'utf16le',
      hasBom: true,
      eol: '\r\n',
      mtimeMs: 1234,
      detached: false,
    })
    // What the editor watches to rebuild: Reload from Disk never moved it.
    expect(doc.reloadToken).toBe(token + 1)
  })
})
