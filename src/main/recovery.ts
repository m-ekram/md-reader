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
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './log'
import { readTextFileSync } from './fs/textfile'

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
 * Stores the file's current bytes before it is overwritten.
 *
 * Deliberately a Buffer rather than a decoded string: a backup that has been
 * through encoding and line-ending normalization is not the file that was
 * replaced, which defeats the point of keeping it.
 */
export function backup(path: string, previousBytes: Buffer): void {
  try {
    writeFileSync(join(dir('backups'), `${keyFor(path)}.bak`), previousBytes)
  } catch (err) {
    log.warn('backup failed', { path, err: String(err) })
  }
}

export function readBackup(path: string): Buffer | null {
  const p = join(dir('backups'), `${keyFor(path)}.bak`)
  try {
    return existsSync(p) ? readFileSync(p) : null
  } catch {
    return null
  }
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
      const stale = statSync(entry.path).mtimeMs > entry.at
      if (!stale && onDisk !== entry.content) out.push(entry)
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
