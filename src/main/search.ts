/**
 * Search coordination: owns the worker's lifetime and streams its hits to the
 * window that asked.
 *
 * At most one search runs per window. Typing another character supersedes the
 * previous query, and the old worker is told to stop rather than being left to
 * finish work nobody will look at.
 */
import { BrowserWindow } from 'electron'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { log } from './log'
import { loadIgnores } from './workspace'
import type { SearchHit } from './search-worker'

export interface SearchOptions {
  root: string
  query: string
  caseSensitive?: boolean
}

interface Running {
  id: number
  worker: Worker
}

const running = new Map<number, Running>() // keyed by window id
let nextSearchId = 1

const MAX_FILE_BYTES = 1024 * 1024
const MAX_RESULTS = 2000

export async function startSearch(win: BrowserWindow, opts: SearchOptions): Promise<number> {
  cancelSearch(win)

  const id = nextSearchId++
  const ignores = await loadIgnores(opts.root)

  let worker: Worker
  try {
    worker = new Worker(join(__dirname, 'search-worker.js'), {
      workerData: {
        root: opts.root,
        query: opts.query,
        caseSensitive: opts.caseSensitive ?? false,
        ignores: [...ignores],
        maxFileBytes: MAX_FILE_BYTES,
        maxResults: MAX_RESULTS,
      },
    })
  } catch (err) {
    log.error('search worker failed to start', { err: String(err) })
    return id
  }

  running.set(win.id, { id, worker })

  const send = (channel: string, payload: unknown): void => {
    // The window can close, or a newer search can supersede this one, while the
    // worker is still producing results.
    if (win.isDestroyed()) return
    if (running.get(win.id)?.id !== id) return
    win.webContents.send(channel, payload)
  }

  worker.on('message', (m: { type: string; hit?: SearchHit; found?: number }) => {
    if (m.type === 'hit' && m.hit) send('search:hit', { id, hit: m.hit })
    else if (m.type === 'done') send('search:done', { id, found: m.found ?? 0 })
  })

  worker.on('error', (err) => {
    log.warn('search worker error', { err: String(err) })
    send('search:done', { id, found: 0 })
  })

  worker.on('exit', () => {
    if (running.get(win.id)?.id === id) running.delete(win.id)
  })

  return id
}

export function cancelSearch(win: BrowserWindow): void {
  const current = running.get(win.id)
  if (!current) return
  running.delete(win.id)
  try {
    // Ask politely first so the walk stops at its next check, then make sure.
    current.worker.postMessage({ type: 'cancel' })
    void current.worker.terminate()
  } catch {
    // Already gone.
  }
}

export function cancelAllSearches(): void {
  for (const [, r] of running) void r.worker.terminate()
  running.clear()
}
