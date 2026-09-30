/**
 * The safety net under every save.
 *
 * Two independent mechanisms, because they cover different failures:
 *
 *   backups  - the file's previous content, kept just before we overwrite it.
 *              Covers "the save itself wrote something wrong", which for a
 *              WYSIWYG editor re-serializing markdown is a real possibility.
 *
 *   journal  - unsaved buffer content, written on a debounce while editing.
 *              Covers "the process died before the user saved". This is what
 *              makes recovery on next launch possible.
 */
import { app } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { log } from './log'
import { decodeTextBuffer, readTextFileSync } from './fs/textfile'

export interface JournalEntry {
  path: string
  content: string
  /** Epoch ms when the buffer was journalled. */
  at: number
}

/** Pending journal writes, held so a shutdown can flush rather than drop them. */
interface Pending {
  timer: NodeJS.Timeout
  entry: JournalEntry
}
const debounces = new Map<string, Pending>()

function keyFor(path: string): string {
  return createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 32)
}

function dir(kind: 'backups' | 'journal'): string {
  const d = join(app.getPath('userData'), kind)
  mkdirSync(d, { recursive: true })
  return d
}

/**
 * Versions: every file's earlier contents, kept before each save overwrites
 * them, in a folder of its own (`backups/<key>/`), newest last by name.
 *
 * Only one was kept at first, so a save that went wrong twice lost the good
 * version for good. Up to MAX_VERSIONS are kept, and at most MAX_BYTES for one
 * file, always keeping the newest.
 */
const MAX_VERSIONS = 20
const MAX_BYTES = 10 * 1024 * 1024
/** A version's id is its file name less `.bak`: its time, and a random tail. */
const VERSION_ID = /^\d{13}-[0-9a-f]{6}$/

export interface VersionInfo {
  id: string
  savedAtMs: number
  size: number
}

function historyDir(path: string): string {
  return join(dir('backups'), keyFor(path))
}

/** The single backup an earlier version of the app kept, taken in as a version. */
function adoptOldBackup(path: string, folder: string): void {
  const old = join(dir('backups'), `${keyFor(path)}.bak`)
  if (!existsSync(old)) return
  try {
    const at = Math.floor(statSync(old).mtimeMs)
    renameSync(old, join(folder, `${String(at).padStart(13, '0')}-${randomTail()}.bak`))
  } catch (err) {
    log.warn('could not take in an old backup', { path, err: String(err) })
  }
}

function randomTail(): string {
  return randomBytes(3).toString('hex')
}

/** The versions kept for a path, newest first. */
export function listVersions(path: string): VersionInfo[] {
  const folder = historyDir(path)
  if (!existsSync(folder)) {
    const old = join(dir('backups'), `${keyFor(path)}.bak`)
    if (!existsSync(old)) return []
    mkdirSync(folder, { recursive: true })
    adoptOldBackup(path, folder)
  }
  try {
    return readdirSync(folder)
      .filter((f) => f.endsWith('.bak') && VERSION_ID.test(f.slice(0, -4)))
      .map((f) => ({
        id: f.slice(0, -4),
        savedAtMs: Number(f.slice(0, 13)),
        size: statSync(join(folder, f)).size,
      }))
      .sort((a, b) => b.id.localeCompare(a.id))
  } catch {
    return []
  }
}

/** One version's bytes, or null. The id is checked before it names a file. */
export function readVersion(path: string, id: string): Buffer | null {
  if (typeof id !== 'string' || !VERSION_ID.test(id)) return null
  const p = join(historyDir(path), `${id}.bak`)
  try {
    return existsSync(p) ? readFileSync(p) : null
  } catch {
    return null
  }
}

/** Drops the oldest versions past the count and the size allowed. */
function prune(path: string): void {
  const folder = historyDir(path)
  const versions = listVersions(path)
  let bytes = 0
  versions.forEach((v, i) => {
    bytes += v.size
    // The newest is always kept, whatever its size.
    if (i > 0 && (i >= MAX_VERSIONS || bytes > MAX_BYTES)) {
      try {
        unlinkSync(join(folder, `${v.id}.bak`))
      } catch {
        /* the next save tries again */
      }
    }
  })
}

/**
 * Stores the file's current bytes before it is overwritten.
 *
 * Deliberately a Buffer rather than a decoded string: a backup that has been
 * through encoding and line-ending normalization is not the file that was
 * replaced, which defeats the point of keeping it. A save that changed
 * nothing since the last version adds none.
 */
export function backup(path: string, previousBytes: Buffer): void {
  try {
    const folder = historyDir(path)
    mkdirSync(folder, { recursive: true })
    adoptOldBackup(path, folder)
    const [latest] = listVersions(path)
    const last = latest ? readVersion(path, latest.id) : null
    if (last && Buffer.compare(last, previousBytes) === 0) return
    // Later than the latest by name, even if the clock went back.
    const now = Math.max(Date.now(), latest ? latest.savedAtMs + 1 : 0)
    writeFileSync(
      join(folder, `${String(now).padStart(13, '0')}-${randomTail()}.bak`),
      previousBytes
    )
    writeFileSync(join(folder, 'meta.json'), JSON.stringify({ path }), 'utf8')
    prune(path)
  } catch (err) {
    log.warn('backup failed', { path, err: String(err) })
  }
}

/** Takes a file's versions along when it is renamed or moved. */
export function moveHistory(from: string, to: string): void {
  const src = historyDir(from)
  if (keyFor(from) === keyFor(to) || !existsSync(src)) return
  try {
    const dest = historyDir(to)
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(src)) {
      if (f.endsWith('.bak')) renameSync(join(src, f), join(dest, f))
    }
    writeFileSync(join(dest, 'meta.json'), JSON.stringify({ path: to }), 'utf8')
    rmSync(src, { recursive: true, force: true })
    prune(to)
  } catch (err) {
    log.warn('could not move a file’s history', { from, to, err: String(err) })
  }
}

export interface BackupInfo {
  exists: boolean
  /** Decoded content of the backup, ready to put in the editor. */
  content?: string
  savedAtMs?: number
  size?: number
}

/**
 * The backup for a path, decoded and described.
 *
 * Backups were written from the first save onwards but nothing could read them,
 * which made the whole mechanism false comfort. This is what Help > Data
 * Recovery uses.
 */
export function backupInfo(path: string): BackupInfo {
  const [latest] = listVersions(path)
  const buf = latest ? readVersion(path, latest.id) : null
  if (!latest || !buf) return { exists: false }
  return {
    exists: true,
    content: decodeTextBuffer(buf).content,
    savedAtMs: latest.savedAtMs,
    size: buf.length,
  }
}

/** The newest version's bytes, or null. */
export function readBackup(path: string): Buffer | null {
  const [latest] = listVersions(path)
  return latest ? readVersion(path, latest.id) : null
}

function writeEntry(key: string, entry: JournalEntry): void {
  try {
    writeFileSync(join(dir('journal'), `${key}.json`), JSON.stringify(entry), 'utf8')
  } catch (err) {
    log.warn('journal write failed', { path: entry.path, err: String(err) })
  }
}

/** Debounced so typing does not hammer the disk. */
export function journal(path: string, content: string): void {
  const key = keyFor(path)
  const existing = debounces.get(key)
  if (existing) clearTimeout(existing.timer)

  const entry: JournalEntry = { path, content, at: Date.now() }
  const timer = setTimeout(() => {
    debounces.delete(key)
    writeEntry(key, entry)
  }, 1500)

  debounces.set(key, { timer, entry })
}

/** Called once a buffer is safely on disk; its journal is no longer needed. */
export function clearJournal(path: string): void {
  const key = keyFor(path)
  const pending = debounces.get(key)
  if (pending) {
    clearTimeout(pending.timer)
    debounces.delete(key)
  }
  try {
    const p = join(dir('journal'), `${key}.json`)
    if (existsSync(p)) unlinkSync(p)
  } catch {
    // A stale journal is harmless; it is checked against mtime before use.
  }
}

/**
 * Journals worth offering on launch: those newer than the file they shadow,
 * and whose content actually differs from what is on disk.
 */
export function pendingRecoveries(): JournalEntry[] {
  const out: JournalEntry[] = []
  let files: string[] = []
  try {
    files = readdirSync(dir('journal'))
  } catch {
    return out
  }

  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const full = join(dir('journal'), f)
    try {
      const entry = JSON.parse(readFileSync(full, 'utf8')) as JournalEntry
      if (!entry?.path || typeof entry.content !== 'string') {
        unlinkSync(full)
        continue
      }
      if (!existsSync(entry.path)) {
        out.push(entry)
        continue
      }
      // Must decode the way the editor does. A plain utf8 read mangles UTF-16,
      // so those files never matched and were offered for recovery every launch.
      const onDisk = readTextFileSync(entry.path).content
      // Discarded only when the file already holds it. A journal that looked
      // older than its file was deleted too, unasked, but the two times come
      // from different clocks: a clock set back, or a file dated in the future,
      // and the user's unsaved work was lost. A save in the app clears the
      // journal itself; a newer file is another program's, and the user is
      // asked. A spurious offer costs a dialog; a wrong discard costs the work.
      if (onDisk !== entry.content) out.push(entry)
      else unlinkSync(full)
    } catch (err) {
      log.warn('bad journal entry discarded', { file: f, err: String(err) })
      try {
        unlinkSync(full)
      } catch {
        /* ignore */
      }
    }
  }
  return out
}

/**
 * Writes any debounced journal entries immediately, for shutdown.
 *
 * This has to actually write them. Simply cancelling the timers would discard
 * up to the last 1.5 seconds of unsaved typing at the exact moment the journal
 * exists to protect it.
 */
export function flushJournals(): void {
  for (const [key, pending] of debounces) {
    clearTimeout(pending.timer)
    writeEntry(key, pending.entry)
  }
  debounces.clear()
}
