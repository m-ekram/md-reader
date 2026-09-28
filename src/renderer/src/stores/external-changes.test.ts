import { describe, it, expect, vi } from 'vitest'
import type { WatchEvent } from '../../../main/watcher'
import { adoptFile, newDoc } from './documents'
import { adoptFromDisk, initExternalChanges } from './external-changes'

const BEFORE = 'C:\\notes\\before.md'
const AFTER = 'C:\\notes\\after.md'
const TEXT = '# Renamed\n\nbody\n'

describe('a file renamed while open', () => {
  let deliver: (events: WatchEvent[]) => void = () => {}
  ;(window as unknown as { api: unknown }).api = {
    workspace: { onWatchEvents: (fn: typeof deliver) => (deliver = fn) },
    file: {
      read: vi.fn(async (path: string) => ({
        path,
        content: TEXT,
        encoding: 'utf8',
        hasBom: false,
        eol: '\n',
        mtimeMs: 2,
      })),
      discardRecovery: vi.fn(async () => {}),
      journal: vi.fn(),
    },
  }
  initExternalChanges()
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('follows the new name when the removal and the addition arrive apart', async () => {
    const doc = adoptFile({
      path: BEFORE,
      content: TEXT,
      encoding: 'utf8',
      hasBom: false,
      eol: '\n',
      mtimeMs: 1,
    })

    // The watcher reports a new file only once its size has held still, which
    // can be after it has already sent the removal on its own.
    deliver([{ kind: 'removed', path: BEFORE }])
    await settle()
    deliver([{ kind: 'added', path: AFTER }])
    await settle()

    expect(doc.path).toBe(AFTER)
    expect(doc.name).toBe('after.md')
    expect(doc.detached).toBe(false)
  })

  it('does not take a file made long after the deletion for the same one', async () => {
    const OLD = 'C:\\notes\\old.md'
    const doc = adoptFile({
      path: OLD,
      content: TEXT,
      encoding: 'utf8',
      hasBom: false,
      eol: '\n',
      mtimeMs: 1,
    })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
    deliver([{ kind: 'removed', path: OLD }])
    await settle()

    // A minute later, a copy with the same text appears elsewhere.
    clock.mockReturnValue(61_000)
    deliver([{ kind: 'added', path: 'C:\\notes\\copy.md' }])
    await settle()
    clock.mockRestore()

    expect(doc.path).toBe(OLD)
    expect(doc.detached).toBe(true)
  })
})

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
