// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, utimes } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The module that stands between the user and losing work, and until now the
 * largest untested file in the project. The one bug found in it so far —
 * `flushJournals` cancelling pending writes instead of performing them, which
 * discarded the last 1.5 s of typing on quit — was found by reading the code.
 * These tests exist so the next one is not.
 *
 * `app.getPath('userData')` is stubbed to a temp directory so each test gets a
 * clean journal and backup store.
 */
let userData: string

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

vi.mock('./log', () => ({
  log: { info: () => {}, warn: () => {}, error: () => {} },
}))

let recovery: typeof import('./recovery')

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'ekmd-recovery-'))
  vi.resetModules()
  recovery = await import('./recovery')
})

afterEach(async () => {
  recovery.flushJournals()
  await rm(userData, { recursive: true, force: true })
})

const journalDir = () => join(userData, 'journal')
const backupDir = () => join(userData, 'backups')
const journalCount = () => (existsSync(journalDir()) ? readdirSync(journalDir()).length : 0)
const readFirstJournal = () =>
  readFileSync(join(journalDir(), readdirSync(journalDir())[0]), 'utf8')

describe('journal', () => {
  it('does not write immediately, so typing does not hammer the disk', () => {
    recovery.journal('C:/notes/a.md', 'first keystroke')
    expect(journalCount()).toBe(0)
  })

  it('writes after the debounce elapses', async () => {
    recovery.journal('C:/notes/a.md', 'settled content')
    await new Promise((r) => setTimeout(r, 1800))
    expect(journalCount()).toBe(1)
  })

  it('flushes pending writes instead of discarding them', () => {
    // The regression guard for the bug this module actually had: the previous
    // implementation cleared its timers on quit and wrote nothing, throwing
    // away up to 1.5 s of unsaved typing at the exact moment it mattered.
    recovery.journal('C:/notes/a.md', 'unsaved work')
    expect(journalCount()).toBe(0)

    recovery.flushJournals()
    expect(journalCount()).toBe(1)

    const entry = JSON.parse(readFirstJournal())
    expect(entry.content).toBe('unsaved work')
  })

  it('keeps only the latest content for a path', () => {
    recovery.journal('C:/notes/a.md', 'v1')
    recovery.journal('C:/notes/a.md', 'v2')
    recovery.journal('C:/notes/a.md', 'v3')
    recovery.flushJournals()

    expect(journalCount()).toBe(1)
    expect(JSON.parse(readFirstJournal()).content).toBe('v3')
  })

  it('keeps separate entries for separate paths', () => {
    recovery.journal('C:/notes/a.md', 'a')
    recovery.journal('C:/notes/b.md', 'b')
    recovery.flushJournals()
    expect(journalCount()).toBe(2)
  })

  it('treats paths case-insensitively, as Windows does', () => {
    recovery.journal('C:/Notes/A.md', 'one')
    recovery.journal('c:/notes/a.md', 'two')
    recovery.flushJournals()
    // Same file on Windows, so one entry rather than two competing ones.
    expect(journalCount()).toBe(1)
  })

  it('clearJournal removes the entry and cancels a pending write', () => {
    recovery.journal('C:/notes/a.md', 'content')
    recovery.flushJournals()
    expect(journalCount()).toBe(1)

    recovery.clearJournal('C:/notes/a.md')
    expect(journalCount()).toBe(0)
  })
})

describe('pendingRecoveries', () => {
  it('offers a journal whose file no longer exists', () => {
    // An untitled buffer, or a file deleted while its tab was open.
    recovery.journal('untitled:doc-1', 'never saved anywhere')
    recovery.flushJournals()

    const pending = recovery.pendingRecoveries()
    expect(pending).toHaveLength(1)
    expect(pending[0].content).toBe('never saved anywhere')
  })

  it('offers a journal that differs from the file on disk', async () => {
    const file = join(userData, 'note.md')
    await writeFile(file, 'saved version', 'utf8')
    recovery.journal(file, 'edited but never saved')
    recovery.flushJournals()

    expect(recovery.pendingRecoveries()).toHaveLength(1)
  })

  it('discards a journal matching the file, and cleans it up', async () => {
    const file = join(userData, 'note.md')
    await writeFile(file, 'identical', 'utf8')
    recovery.journal(file, 'identical')
    recovery.flushJournals()

    expect(recovery.pendingRecoveries()).toHaveLength(0)
    expect(journalCount()).toBe(0)
  })

  it('offers unsaved work even when the file looks newer than it', async () => {
    // A journal "older" than its file was deleted unasked. But the two times
    // come from different clocks, the file system's and the app's: a clock set
    // back, or a file with a date in the future (copied from a machine whose
    // clock runs ahead, on a share with a skewed clock), and the user's
    // unsaved work was thrown away. A save in the app clears the journal
    // anyway; a newer file is another program's, and the user decides.
    const file = join(userData, 'note.md')
    await writeFile(file, 'newer on disk', 'utf8')
    recovery.journal(file, 'unsaved buffer')
    recovery.flushJournals()

    const future = new Date(Date.now() + 60_000)
    await utimes(file, future, future)

    expect(recovery.pendingRecoveries().map((e) => e.content)).toEqual(['unsaved buffer'])
  })

  it('compares UTF-16 files correctly rather than offering them every launch', async () => {
    // Read as utf8, a UTF-16 file never matches its journal, so it was offered
    // for recovery on every single launch.
    const file = join(userData, 'utf16.md')
    const body = Buffer.from('# Heading\n\nidentical content\n', 'utf16le')
    await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), body]))

    recovery.journal(file, '# Heading\n\nidentical content\n')
    recovery.flushJournals()

    expect(recovery.pendingRecoveries()).toHaveLength(0)
  })

  it('discards a corrupt journal entry rather than throwing', async () => {
    const dir = journalDir()
    await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }))
    await writeFile(join(dir, 'broken.json'), '{ not valid json', 'utf8')

    expect(() => recovery.pendingRecoveries()).not.toThrow()
    expect(journalCount()).toBe(0)
  })

  it('returns nothing when there is no journal directory at all', () => {
    expect(recovery.pendingRecoveries()).toEqual([])
  })
})

describe('backups', () => {
  it('stores raw bytes, not decoded text', () => {
    // A backup that has been through encoding normalization is not the file
    // that was replaced, which defeats the point of keeping one.
    const original = Buffer.from([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00])
    recovery.backup('C:/notes/a.md', original)

    const stored = recovery.readBackup('C:/notes/a.md')
    expect(stored).not.toBeNull()
    expect(Buffer.compare(stored!, original)).toBe(0)
  })

  it('returns null when nothing was backed up', () => {
    expect(recovery.readBackup('C:/notes/never-saved.md')).toBeNull()
  })

  it('reads back the latest of the versions kept', () => {
    recovery.backup('C:/notes/a.md', Buffer.from('first'))
    recovery.backup('C:/notes/a.md', Buffer.from('second'))
    expect(recovery.readBackup('C:/notes/a.md')!.toString()).toBe('second')
  })

  it('keeps backups for different paths apart', () => {
    recovery.backup('C:/notes/a.md', Buffer.from('aaa'))
    recovery.backup('C:/notes/b.md', Buffer.from('bbb'))

    expect(recovery.readBackup('C:/notes/a.md')!.toString()).toBe('aaa')
    expect(recovery.readBackup('C:/notes/b.md')!.toString()).toBe('bbb')
  })
})

describe('version history', () => {
  const path = 'C:/notes/a.md'
  const contents = () =>
    recovery.listVersions(path).map((v) => recovery.readVersion(path, v.id)!.toString())

  it('keeps each version, newest first', () => {
    // Only the last one was kept: a save that went wrong twice lost the good
    // version for good.
    recovery.backup(path, Buffer.from('one'))
    recovery.backup(path, Buffer.from('two'))
    recovery.backup(path, Buffer.from('three'))
    expect(contents()).toEqual(['three', 'two', 'one'])
  })

  it('adds nothing for a save that changed nothing since the last version', () => {
    recovery.backup(path, Buffer.from('same'))
    recovery.backup(path, Buffer.from('same'))
    expect(contents()).toEqual(['same'])
  })

  it('keeps twenty at most, dropping the oldest', () => {
    for (let i = 1; i <= 25; i++) recovery.backup(path, Buffer.from(`v${i}`))
    const kept = contents()
    expect(kept).toHaveLength(20)
    expect(kept[0]).toBe('v25')
    expect(kept.at(-1)).toBe('v6')
  })

  it('keeps ten megabytes at most, but always the newest', () => {
    const big = (c: string) => Buffer.alloc(4 * 1024 * 1024, c)
    recovery.backup(path, big('a'))
    recovery.backup(path, big('b'))
    recovery.backup(path, big('c'))
    // Three of 4 MB is 12 MB: the oldest goes.
    expect(contents().map((c) => c[0])).toEqual(['c', 'b'])
    recovery.backup(path, Buffer.alloc(11 * 1024 * 1024, 'd'))
    expect(contents().map((c) => c[0])).toEqual(['d'])
  })

  it('takes over the single backup an older version kept', async () => {
    const { createHash } = await import('node:crypto')
    const key = createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 32)
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(backupDir(), { recursive: true })
    writeFileSync(join(backupDir(), `${key}.bak`), 'from before')
    recovery.backup(path, Buffer.from('new'))
    expect(contents()).toEqual(['new', 'from before'])
  })

  it('refuses a version id that is not one, rather than read any file', () => {
    recovery.backup(path, Buffer.from('one'))
    expect(recovery.readVersion(path, '../../secrets')).toBeNull()
    expect(recovery.readVersion(path, 'meta')).toBeNull()
  })

  it('moves with the file when it is renamed', () => {
    recovery.backup(path, Buffer.from('kept'))
    recovery.moveHistory(path, 'C:/notes/renamed.md')
    expect(recovery.listVersions(path)).toEqual([])
    const moved = recovery.listVersions('C:/notes/renamed.md')
    expect(recovery.readVersion('C:/notes/renamed.md', moved[0].id)!.toString()).toBe('kept')
  })
})
