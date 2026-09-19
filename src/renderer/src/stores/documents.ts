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

export interface Doc {
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
}

let untitledCounter = 0

const state = reactive({
  docs: [] as Doc[],
  activeIndex: -1,
})

export function useDocuments() {
  return state
}

export const activeDoc = computed<Doc | null>(() =>
  state.activeIndex >= 0 ? state.docs[state.activeIndex] ?? null : null
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
  }
  state.docs.push(d)
  state.activeIndex = state.docs.length - 1
  invalidateCommands()
  return d
}

export function adoptFile(f: DocumentFile): Doc {
  // Re-opening an already-open file focuses it instead of duplicating the tab.
  const existing = state.docs.findIndex((d) => d.path && d.path.toLowerCase() === f.path.toLowerCase())
  if (existing >= 0) {
    state.activeIndex = existing
    invalidateCommands()
    return state.docs[existing]
  }

  const d: Doc = {
    path: f.path,
    name: f.path.split(/[\/]/).pop() ?? f.path,
    content: f.content,
    savedContent: f.content,
    encoding: f.encoding,
    hasBom: f.hasBom,
    eol: f.eol,
    mtimeMs: f.mtimeMs,
    lossy: null,
    sourceMode: false,
  }
  state.docs.push(d)
  state.activeIndex = state.docs.length - 1
  invalidateCommands()
  return d
}

export function closeDoc(index: number): void {
  state.docs.splice(index, 1)
  if (state.docs.length === 0) state.activeIndex = -1
  else state.activeIndex = Math.min(state.activeIndex, state.docs.length - 1)
  invalidateCommands()
}

export function setActive(index: number): void {
  state.activeIndex = index
  invalidateCommands()
}
