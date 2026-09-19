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

export interface JournalEntry {
  path: string
  content: string
  /** Epoch ms when the buffer was journalled. */
  at: number
}

const debounces = new Map<string, NodeJS.Timeout>()

function keyFor(path: string): string {
  return createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 32)
}

function dir(kind: 'backups' | 'journal'): string {
  const d = join(app.getPath('userData'), kind)
  mkdirSync(d, { recursive: true })
  return d
}

/** Stores the file's current on-disk content before it is overwritten. */
export function backup(path: string, previousContent: string): void {
  try {
    writeFileSync(join(dir('backups'), `${keyFor(path)}.bak`), previousContent, 'utf8')
  } catch (err) {
    log.warn('backup failed', { path, err: String(err) })
  }
}

export function readBackup(path: string): string | null {
  const p = join(dir('backups'), `${keyFor(path)}.bak`)
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  } catch {
    return null
  }
}

/** Debounced so typing does not hammer the disk. */
export function journal(path: string, content: string): void {
  const key = keyFor(path)
  const existing = debounces.get(key)
  if (existing) clearTimeout(existing)
  debounces.set(
    key,
    setTimeout(() => {
      debounces.delete(key)
      try {
        const entry: JournalEntry = { path, content, at: Date.now() }
        writeFileSync(join(dir('journal'), `${key}.json`), JSON.stringify(entry), 'utf8')
      } catch (err) {
        log.warn('journal write failed', { path, err: String(err) })
      }
    }, 1500)
  )
}

/** Called once a buffer is safely on disk; its journal is no longer needed. */
export function clearJournal(path: string): void {
  const key = keyFor(path)
  const pending = debounces.get(key)
  if (pending) {
    clearTimeout(pending)
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
      const onDisk = readFileSync(entry.path, 'utf8').replace(/\r\n/g, '\n')
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

/** Flushes any debounced journal writes immediately, for shutdown. */
export function flushJournals(): void {
  for (const [, timer] of debounces) clearTimeout(timer)
  debounces.clear()
}
