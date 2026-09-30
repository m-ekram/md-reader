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
 * A document's editor, if it has one built. Commands reach it through
 * `editor/view.ts`, which asks for the active document's.
 *
 * There used to be an "editor most recently on screen" instead. A document
 * shown as source has no editor of its own, so that was another tab's, and a
 * command in the source view changed a document the user could not see.
 */
export function editorFor(id: string): EditorHandle | null {
  return entries.get(id)?.handle ?? null
}

/**
 * Hands every live editor's unreported edits to the document store.
 *
 * Call before anything that decides from the store — saving, closing,
 * quitting, switching to source mode, reacting to a change on disk. Each
 * editor reports on a debounce, so without this those decisions are made
 * against text that is missing the last keystrokes.
 */
export function flushAll(): void {
  for (const e of entries.values()) e.handle.flush()
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
  documentPath?: () => string | null
  onChange: (markdown: string) => void
  onCaret?: (headingIndex: number) => void
  onWikiLink?: (link: string) => void
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
    documentPath: opts.documentPath,
    onChange: opts.onChange,
    onCaret: opts.onCaret,
    onWikiLink: opts.onWikiLink,
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
