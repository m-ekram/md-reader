/**
 * Open documents for this window.
 *
 * Each window owns its own document set; nothing here is shared across windows.
 * A document carries the file's original format (encoding, BOM, line endings) so
 * a save reproduces those rather than imposing our own.
 */
import { reactive, computed, ref } from 'vue'
import type { DocumentFile } from '../../../shared/ipc'
import { invalidateCommands, run } from '../commands/registry'
import { notify } from './notifications'
import { release } from '../editor/pool'
import { useSettingsStore } from './settings'
import { showNotice } from './ui'
import { logError } from '../utils/report'
import { explainOpenError } from '../../../shared/open-errors'

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
  /**
   * Line endings as last read or written. A change of line endings is an
   * edit: counted, closing the document no longer drops it without asking.
   */
  savedEol: DocumentFile['eol']
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
/**
 * A document id, unique across windows and launches. Untitled documents are
 * journalled under it, and a counter that restarted in every window gave two
 * windows' untitled work the same journal.
 */
function newDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `doc-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

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
  return d.content !== d.savedContent || d.eol !== d.savedEol
}

/** Records what is now on disk: the one way a document becomes clean. */
export function markSaved(d: Doc, content: string, eol: Doc['eol']): void {
  d.savedContent = content
  d.savedEol = eol
}

export function anyDirty(): boolean {
  return state.docs.some(isDirty)
}

/**
 * A new, empty, unsaved document. `id` is given only when restoring one, so it
 * keeps the journal it was recovered from.
 */
export function newDoc(opts: { id?: string } = {}): Doc {
  untitledCounter++
  // As chosen in Preferences. Clean either way: nothing to save yet.
  const eol = useSettingsStore().value.newFileEol === 'lf' ? '\n' : '\r\n'
  const d: Doc = {
    id: opts.id ?? newDocId(),
    path: null,
    name: untitledCounter === 1 ? 'Untitled' : `Untitled ${untitledCounter}`,
    content: '',
    savedContent: '',
    encoding: 'utf8',
    hasBom: false,
    eol,
    savedEol: eol,
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
    id: newDocId(),
    path: f.path,
    // Both separators: on Windows a forward-slash-only split leaves the whole
    // path as the document name, which then shows in the tab and title bar.
    name: f.path.split(/[\\/]/).pop() ?? f.path,
    content: f.content,
    savedContent: f.content,
    encoding: f.encoding,
    hasBom: f.hasBom,
    eol: f.eol,
    savedEol: f.eol,
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
  if (d.sourceMode) explainForcedSource(d)
  // The reactive proxy, not the raw object: re-opening an already-open file
  // returns the proxy from the array, and callers compare these by identity.
  return state.docs[state.activeIndex]
}

/**
 * Says why a document opened in source view. It used to happen without a
 * word, which read as the formatting having broken.
 */
function explainForcedSource(d: Doc): void {
  const lines = (d.content.match(/\n/g)?.length ?? 0) + 1
  notify(`${d.name} has ${lines.toLocaleString()} lines, so it opened in source view.`, {
    key: `large-${d.id}`,
    actions: [
      {
        label: 'Show Formatted',
        run: () => {
          const i = state.docs.findIndex((x) => x.id === d.id)
          if (i < 0) return
          setActive(i)
          if (state.docs[i].sourceMode) void run('view.sourceMode')
        },
      },
    ],
  })
}

/**
 * A document whose editor should take the focus once it is on screen.
 *
 * Opening a file from the tree or Open Quickly left the focus in the list, or
 * on the page itself, so typing straight after went nowhere. The editor host
 * takes this up when it shows the document (`takeEditorFocus`).
 */
export const focusWanted = ref<string | null>(null)

export function requestEditorFocus(docId: string): void {
  focusWanted.value = docId
}

/** Whether the document shown should take the focus; asked once. */
export function takeEditorFocus(docId: string): boolean {
  if (focusWanted.value !== docId) return false
  focusWanted.value = null
  return true
}

/**
 * Opens a path, focusing it if it is already open: the sidebar, Open Quickly,
 * Explorer and the launch all come through here.
 *
 * A failure is said, naming the file, and null returned. From the sidebar or
 * Explorer it used to reach the log and nowhere else: the click did nothing.
 */
export async function openPath(path: string, opts: { focus?: boolean } = {}): Promise<Doc | null> {
  try {
    const doc = adoptFile(await window.api.file.read(path))
    if (opts.focus !== false) requestEditorFocus(doc.id)
    return doc
  } catch (err) {
    showNotice(explainOpenError(path, err), 'error')
    logError(`open ${path}`, err)
    return null
  }
}

export function closeDoc(index: number): void {
  const [removed] = state.docs.splice(index, 1)
  if (removed) void release(removed.id)
  if (state.docs.length === 0) state.activeIndex = -1
  else state.activeIndex = Math.min(state.activeIndex, state.docs.length - 1)
  invalidateCommands()
}

/** Moves a tab to another place, keeping the same document in front. */
export function moveDoc(from: number, to: number): void {
  const n = state.docs.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return
  const active = state.docs[state.activeIndex]
  const [moved] = state.docs.splice(from, 1)
  state.docs.splice(to, 0, moved)
  state.activeIndex = state.docs.indexOf(active)
  invalidateCommands()
}

export function setActive(index: number): void {
  state.activeIndex = index
  invalidateCommands()
}
