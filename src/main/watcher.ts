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
}

let watcher: FSWatcher | null = null
let watchedRoot: string | null = null

/** Coalesces bursts per path; the last event for a path wins. */
const pending = new Map<string, WatchEventKind>()
let flushTimer: NodeJS.Timeout | null = null
const DEBOUNCE_MS = 150

function queue(kind: WatchEventKind, path: string): void {
  if (!isMarkdown(path)) return

  // An add following a remove within one burst is a rewrite, not a deletion:
  // some editors save by replacing the file. Reporting the removal would
  // detach the user's tab for no reason.
  const prior = pending.get(path)
  if (prior === 'removed' && kind === 'added') pending.set(path, 'changed')
  else pending.set(path, kind)

  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, DEBOUNCE_MS)
}

function flush(): void {
  flushTimer = null
  if (pending.size === 0) return

  const events: WatchEvent[] = [...pending].map(([path, kind]) => ({ path, kind }))
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
      ignored: (p: string) =>
        /[\\/](\.git|node_modules|\.svn|\.hg)([\\/]|$)/.test(p),
      depth: 12,
    })

    watcher
      .on('add', (p) => queue('added', p))
      .on('change', (p) => queue('changed', p))
      .on('unlink', (p) => queue('removed', p))
      .on('error', (err) => log.warn('watcher error', { err: String(err) }))

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
  if (w) await w.close().catch(() => {})
}
