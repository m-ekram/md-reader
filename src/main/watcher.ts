/**
 * Filesystem watching.
 *
 * One chokidar instance for the whole application, not one per window: several
 * windows can show the same folder, and duplicating the watch would duplicate
 * every event and every reload prompt.
 *
 * Events are debounced because sync tools (OneDrive, Dropbox, git checkouts)
 * rewrite whole folders at once. Without it, checking out a branch would raise
 * a storm of reload prompts.
 */
import { BrowserWindow } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { log } from './log'
import { isMarkdown } from './workspace'

export type WatchEventKind = 'added' | 'changed' | 'removed'

export interface WatchEvent {
  kind: WatchEventKind
  path: string
  /** A folder, added or removed: the file tree follows these, documents do not. */
  dir?: true
}

let watcher: FSWatcher | null = null
let watchedRoot: string | null = null

/** Coalesces bursts per path; the last event for a path wins. */
const pending = new Map<string, WatchEvent>()
let flushTimer: NodeJS.Timeout | null = null
const DEBOUNCE_MS = 150

function queue(kind: WatchEventKind, path: string): void {
  if (!isMarkdown(path)) return

  // An add following a remove within one burst is a rewrite, not a deletion:
  // some editors save by replacing the file. Reporting the removal would
  // detach the user's tab for no reason.
  const prior = pending.get(path)?.kind
  if (prior === 'removed' && kind === 'added') pending.set(path, { kind: 'changed', path })
  else pending.set(path, { kind, path })
  schedule()
}

function queueDir(kind: 'added' | 'removed', path: string): void {
  pending.set(path, { kind, path, dir: true })
  schedule()
}

function schedule(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, DEBOUNCE_MS)
}

function flush(): void {
  flushTimer = null
  if (pending.size === 0) return

  const events: WatchEvent[] = [...pending.values()]
  pending.clear()

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('watcher:events', events)
  }
}

export function watchRoot(root: string | null): void {
  if (root === watchedRoot) return
  void stopWatching()
  watchedRoot = root
  if (!root) return

  try {
    watcher = chokidar.watch(root, {
      ignoreInitial: true,
      // Large files and slow disks: wait until the writer has finished.
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      ignored: (p: string) => /[\\/](\.git|node_modules|\.svn|\.hg)([\\/]|$)/.test(p),
      depth: 12,
    })

    const started = watcher
    watcher
      .on('add', (p) => queue('added', p))
      .on('change', (p) => queue('changed', p))
      .on('unlink', (p) => queue('removed', p))
      // Folders, for the file tree. The root itself is reported gone if it goes.
      .on('addDir', (p) => queueDir('added', p))
      .on('unlinkDir', (p) => queueDir('removed', p))
      .on('error', (err) => log.warn('watcher error', { err: String(err) }))
      // Changes made before this are not seen. Recorded where a test can wait
      // for it: a fixed pause before renaming a file missed the rename on a
      // busy machine.
      .on('ready', () => {
        if (watcher !== started) return
        ;(globalThis as unknown as { __watcherReady?: string }).__watcherReady = root
      })

    log.info('watching workspace', { root })
  } catch (err) {
    log.error('failed to watch workspace', { root, err: String(err) })
    watcher = null
    watchedRoot = null
  }
}

export async function stopWatching(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pending.clear()
  const w = watcher
  watcher = null
  watchedRoot = null
  ;(globalThis as unknown as { __watcherReady?: string }).__watcherReady = undefined
  if (w) await w.close().catch(() => {})
}
