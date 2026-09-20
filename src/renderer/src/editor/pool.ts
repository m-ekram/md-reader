/**
 * Keeps recently used editors alive so undo history survives a tab switch.
 *
 * Phase 1 destroyed the Crepe instance and built a new one whenever the active
 * document changed, which meant undo started empty every time you came back to a
 * tab. ProseMirror's history lives in the editor state, so the only way to keep
 * it is to keep the editor.
 *
 * Each document's editor mounts into its own detached element. Activating a
 * document moves that element into the visible host; nothing is rebuilt. Past
 * the cap the least-recently-used editor is destroyed, which loses that
 * document's undo stack but never its content — the text lives in the documents
 * store, and the editor is rebuilt from there on next use.
 */
import { createEditor, type EditorHandle } from './crepe'

export interface PooledEditor {
  handle: EditorHandle
  /** Detached container; the host adopts this element when the doc is active. */
  el: HTMLElement
}

interface Entry extends PooledEditor {
  id: string
  /** Monotonic counter, for least-recently-used eviction. */
  usedAt: number
}

const entries = new Map<string, Entry>()
let clock = 0
let capacity = 5

export function setCapacity(n: number): void {
  capacity = Math.max(1, n)
  void evictIfNeeded()
}

export function has(id: string): boolean {
  return entries.has(id)
}

export function size(): number {
  return entries.size
}

/**
 * The editor most recently brought on screen.
 *
 * Menu commands act on whatever the user is looking at, and the pool is the
 * only thing that knows which instance that is.
 */
export function activeEditor(): EditorHandle | null {
  let best: Entry | null = null
  for (const e of entries.values()) {
    if (!best || e.usedAt > best.usedAt) best = e
  }
  return best?.handle ?? null
}

/** Ids currently held, most recently used first. Exposed for tests. */
export function liveIds(): string[] {
  return [...entries.values()].sort((a, b) => b.usedAt - a.usedAt).map((e) => e.id)
}

async function evictIfNeeded(): Promise<void> {
  while (entries.size > capacity) {
    let oldest: Entry | null = null
    for (const e of entries.values()) {
      if (!oldest || e.usedAt < oldest.usedAt) oldest = e
    }
    if (!oldest) return
    entries.delete(oldest.id)
    await oldest.handle.destroy()
    oldest.el.remove()
  }
}

/**
 * Returns the pooled editor for a document, creating it if absent.
 *
 * `getContent` is only consulted when the editor has to be built, so a cached
 * editor is never reset from the store — that would discard in-flight edits and
 * the undo stack along with them.
 */
export async function acquire(opts: {
  id: string
  getContent: () => string
  onChange: (markdown: string) => void
}): Promise<PooledEditor> {
  const existing = entries.get(opts.id)
  if (existing) {
    existing.usedAt = ++clock
    return existing
  }

  const el = document.createElement('div')
  el.className = 'editor-instance'

  const handle = await createEditor({
    root: el,
    value: opts.getContent(),
    onChange: opts.onChange,
  })

  const entry: Entry = { id: opts.id, handle, el, usedAt: ++clock }
  entries.set(opts.id, entry)
  await evictIfNeeded()
  return entry
}

/** Called when a document is closed; its editor is no longer wanted. */
export async function release(id: string): Promise<void> {
  const entry = entries.get(id)
  if (!entry) return
  entries.delete(id)
  await entry.handle.destroy()
  entry.el.remove()
}

export async function releaseAll(): Promise<void> {
  const all = [...entries.values()]
  entries.clear()
  for (const e of all) {
    await e.handle.destroy()
    e.el.remove()
  }
}
