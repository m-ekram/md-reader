/**
 * Open documents for this window.
 *
 * Each window owns its own document set; nothing here is shared across windows.
 * A document carries the file's original format (encoding, BOM, line endings) so
 * a save reproduces those rather than imposing our own.
 */
import { reactive, computed } from 'vue'
import type { DocumentFile } from '../../../shared/ipc'
import { invalidateCommands } from '../commands/registry'
import { release } from '../editor/pool'
import { useSettingsStore } from './settings'

export interface Doc {
  /**
   * Stable for the document's whole life, including across a Save As.
   * Views key off this rather than the path, which changes when a file is first
   * saved and would otherwise force a remount that loses the cursor and undo
   * history. It is also the journal key for buffers that have no path yet.
   */
  id: string
  /** Null until the document has been saved somewhere. */
  path: string | null
  name: string
  content: string
  /** Content as last read from or written to disk, for the dirty check. */
  savedContent: string
  encoding: DocumentFile['encoding']
  hasBom: boolean
  eol: DocumentFile['eol']
  mtimeMs: number
  /** Set when the round-trip guard finds constructs we cannot preserve. */
  lossy: { lossy: boolean; note: string } | null
  sourceMode: boolean
  /** Set when the tab is a bundled Help topic rather than a user's file. */
  helpTopic?: string
  /** The file went away while the tab stayed open; content is still here. */
  detached: boolean
  /** Guards this document against edits. Per document, not persisted. */
  readonly: boolean
  /**
   * Bumped when content is replaced wholesale from disk. The editor watches it
   * to rebuild, since a live editor does not re-read its document otherwise.
   */
  reloadToken: number
}

let untitledCounter = 0
let docSeq = 0

/** Journal key: a real path once saved, otherwise a stable synthetic id. */
export function journalKey(d: Doc): string {
  return d.path ?? `untitled:${d.id}`
}

const state = reactive({
  docs: [] as Doc[],
  activeIndex: -1,
})

export function useDocuments() {
  return state
}

export const activeDoc = computed<Doc | null>(() =>
  state.activeIndex >= 0 ? (state.docs[state.activeIndex] ?? null) : null
)

export function isDirty(d: Doc): boolean {
  return d.content !== d.savedContent
}

export function anyDirty(): boolean {
  return state.docs.some(isDirty)
}

export function newDoc(): Doc {
  untitledCounter++
  const d: Doc = {
    id: `doc-${++docSeq}`,
    path: null,
    name: untitledCounter === 1 ? 'Untitled' : `Untitled ${untitledCounter}`,
    content: '',
    savedContent: '',
    encoding: 'utf8',
    hasBom: false,
    eol: '\r\n',
    mtimeMs: 0,
    lossy: null,
    sourceMode: false,
    detached: false,
    readonly: false,
    reloadToken: 0,
  }
  state.docs.push(d)
  state.activeIndex = state.docs.length - 1
  invalidateCommands()
  // The reactive proxy, not the raw object: re-opening an already-open file
  // returns the proxy from the array, and callers compare these by identity.
  return state.docs[state.activeIndex]
}

/**
 * Whether a file is large enough to open in source mode without being asked.
 *
 * Phase 0 measured the cost: mounting the formatted view runs about 0.3 ms per
 * line and dominates long before typing latency does, so a 20 000-line file
 * takes seconds to open and is unpleasant afterwards. Above the threshold the
 * document opens in source mode, which renders only the visible window.
 *
 * The threshold is a setting, and the status bar has already been warning past
 * the lower one — this is the point where the warning becomes the default.
 */
function shouldForceSourceMode(content: string): boolean {
  const limit = useSettingsStore().value.editor.sourceModeForceLines
  if (limit <= 0) return false
  // Counted by newlines rather than by splitting, which would allocate an
  // array the size of the document to answer a question about its length.
  let lines = 1
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10 && ++lines > limit) return true
  }
  return false
}

export function adoptFile(f: DocumentFile): Doc {
  // Re-opening an already-open file focuses it instead of duplicating the tab.
  const existing = state.docs.findIndex(
    (d) => d.path && d.path.toLowerCase() === f.path.toLowerCase()
  )
  if (existing >= 0) {
    state.activeIndex = existing
    invalidateCommands()
    return state.docs[existing]
  }

  const d: Doc = {
    id: `doc-${++docSeq}`,
    path: f.path,
    // Both separators: on Windows a forward-slash-only split leaves the whole
    // path as the document name, which then shows in the tab and title bar.
    name: f.path.split(/[\\/]/).pop() ?? f.path,
    content: f.content,
    savedContent: f.content,
    encoding: f.encoding,
    hasBom: f.hasBom,
    eol: f.eol,
    mtimeMs: f.mtimeMs,
    lossy: null,
    sourceMode: shouldForceSourceMode(f.content),
    detached: false,
    readonly: false,
    reloadToken: 0,
  }
  state.docs.push(d)
  state.activeIndex = state.docs.length - 1
  invalidateCommands()
  // The reactive proxy, not the raw object: re-opening an already-open file
  // returns the proxy from the array, and callers compare these by identity.
  return state.docs[state.activeIndex]
}

/** Opens a path, focusing it if it is already open. Used by every panel. */
export async function openPath(path: string): Promise<Doc> {
  return adoptFile(await window.api.file.read(path))
}

export function closeDoc(index: number): void {
  const [removed] = state.docs.splice(index, 1)
  if (removed) void release(removed.id)
  if (state.docs.length === 0) state.activeIndex = -1
  else state.activeIndex = Math.min(state.activeIndex, state.docs.length - 1)
  invalidateCommands()
}

export function setActive(index: number): void {
  state.activeIndex = index
  invalidateCommands()
}
