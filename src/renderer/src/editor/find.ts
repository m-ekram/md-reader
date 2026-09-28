/**
 * Find and replace inside the active document.
 *
 * One find bar, two editors behind it. The formatted view's find is built on
 * prosemirror-search, which owns the match highlighting and the
 * cursor-advancing commands; the source view's is CodeMirror's search (see
 * `sourceMode.ts`). What is here is the glue: a reactive state the bar binds
 * to, a match count, and sending each action to whichever view shows the
 * active document.
 *
 * Separate from the folder-wide Search panel, which looks across files on disk
 * and never touches the editor.
 */
import { reactive } from 'vue'
import {
  SearchQuery,
  findNext,
  findPrev,
  replaceAll,
  replaceNext,
  search,
  setSearchState,
} from 'prosemirror-search'
import { $prose } from '@milkdown/kit/utils'
import { editorViewCtx } from '@milkdown/kit/core'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { activeDoc } from '../stores/documents'
import { activeEditor } from './view'
import { shownSourceFor } from './source-registry'
import type { FindAction, FindBackend, FindCounts, FindQuerySpec } from './find-types'

export const findState = reactive({
  open: false,
  /** The replace row is hidden until asked for, as most uses are find-only. */
  replaceMode: false,
  query: '',
  replacement: '',
  caseSensitive: false,
  wholeWord: false,
  matches: 0,
  /** 1-indexed position of the match containing the selection, else 0. */
  current: 0,
})

/** The highlighting plugin. Without it there is no visible match at all. */
export const searchPlugin: MilkdownPlugin[] = [$prose(() => search())] as MilkdownPlugin[]

function formattedView(): EditorView | null {
  const handle = activeEditor()
  if (!handle) return null
  let v: EditorView | null = null
  try {
    handle.crepe.editor.action((ctx) => {
      v = ctx.get(editorViewCtx)
    })
  } catch {
    v = null
  }
  return v
}

function toQuery(q: FindQuerySpec): SearchQuery {
  return new SearchQuery({ ...q })
}

/**
 * Counts matches and works out which one the selection is sitting in.
 *
 * prosemirror-search highlights matches but does not report a total, and "3 of
 * 12" is the part people actually read.
 */
function countMatches(state: EditorState, query: SearchQuery): FindCounts {
  if (!query.valid) return { total: 0, current: 0 }

  let total = 0
  let current = 0
  let pos = 0
  // Bounded so a pathological query cannot spin forever on a large document.
  const LIMIT = 10_000

  while (total < LIMIT) {
    const result = query.findNext(state, pos)
    if (!result) break
    total++
    if (result.from <= state.selection.from && result.to >= state.selection.to) current = total
    // Always advance, or a zero-width match would loop.
    pos = Math.max(result.to, result.from + 1)
  }

  return { total, current }
}

/**
 * Scrolls the match the selection sits on into the middle of the pane, when
 * it is off screen.
 *
 * The find commands ask ProseMirror to scroll, but ProseMirror scrolls to the
 * browser's own selection, which is in the find box while the user types
 * there: in a long document the next match was selected, counted "1 of 1",
 * and left out of sight.
 */
function revealSelection(v: EditorView): void {
  const pane = v.dom.closest<HTMLElement>('.editor-scroll')
  if (!pane) return
  const match = v.coordsAtPos(v.state.selection.from)
  const box = pane.getBoundingClientRect()
  if (match.top >= box.top && match.bottom <= box.bottom) return
  pane.scrollTop += match.top - box.top - box.height / 2
}

const PM_COMMANDS = { next: findNext, previous: findPrev, replaceAll }

/**
 * Whether the action came from the find bar, which then keeps the focus.
 *
 * Stepping used to move the focus into the document, so a second Enter in the
 * find box split the paragraph at the match instead of going on to the next
 * one. The current match has its own highlight, so the document does not need
 * the focus for it to show. From anywhere else (F3 from a menu), the document
 * gets it back.
 */
export function inFindBar(): boolean {
  return document.activeElement?.closest('.find') != null
}

/** The formatted view's find. */
function formattedFind(v: EditorView): FindBackend {
  const run = (
    command: (s: EditorState, d?: EditorView['dispatch']) => boolean,
    q: FindQuerySpec
  ) => {
    // Push the current query first. The replace commands read the replacement
    // out of the *editor's* stored query, and that was only being written when
    // the search term changed — so typing a replacement and pressing Replace
    // substituted an empty string, or did nothing at all.
    v.dispatch(setSearchState(v.state.tr, toQuery(q)))
    command(v.state, v.dispatch)
    if (!inFindBar()) v.focus()
    revealSelection(v)
  }

  return {
    apply(q) {
      const query = toQuery(q)
      v.dispatch(setSearchState(v.state.tr, query))
      return countMatches(v.state, query)
    },
    run(action: FindAction, q) {
      if (action === 'replaceAndAdvance') {
        // `replaceNext` on its own only *selects* the next match when nothing
        // is selected, so a single click of Replace appeared to do nothing and
        // people pressed it twice. Selecting first makes one press mean one
        // replacement.
        if (!toQuery(q).valid) return countMatches(v.state, toQuery(q))
        if (countMatches(v.state, toQuery(q)).current === 0) run(findNext, q)
        run(replaceNext, q)
      } else {
        run(PM_COMMANDS[action], q)
      }
      // The selection moved, so "3 of 12" needs recomputing.
      return countMatches(v.state, toQuery(q))
    },
    selectedText() {
      if (v.state.selection.empty) return ''
      const text = v.state.doc.textBetween(v.state.selection.from, v.state.selection.to, ' ')
      return text.includes('\n') ? '' : text
    },
    clear() {
      // Clear the highlights, otherwise they linger over the document.
      v.dispatch(setSearchState(v.state.tr, new SearchQuery({ search: '' })))
      v.focus()
    },
  }
}

/** Find for the view showing the active document: formatted or source. */
function backend(): FindBackend | null {
  const doc = activeDoc.value
  if (!doc) return null
  if (doc.sourceMode) return shownSourceFor(doc.id)?.find ?? null
  const v = formattedView()
  return v ? formattedFind(v) : null
}

/** True when the active document is on screen in a view find can search. */
export const canFind = (): boolean => backend() !== null

function spec(): FindQuerySpec {
  return {
    search: findState.query,
    replace: findState.replacement,
    caseSensitive: findState.caseSensitive,
    wholeWord: findState.wholeWord,
  }
}

function show(counts: FindCounts): void {
  findState.matches = counts.total
  findState.current = counts.current
}

/** Pushes the current query into the editor and refreshes the counts. */
export function applyQuery(): void {
  const b = backend()
  show(b ? b.apply(spec()) : { total: 0, current: 0 })
}

function act(action: FindAction): void {
  const b = backend()
  if (b) show(b.run(action, spec()))
}

export const find = {
  next: () => act('next'),
  previous: () => act('previous'),
  replaceAndAdvance: () => act('replaceAndAdvance'),
  replaceEverything: () => act('replaceAll'),
}

/** Opens the panel, seeding it from the selection when there is one. */
export function openFind(replaceMode: boolean): void {
  // Only a single line: a multi-line selection is a range to search within,
  // not a term to search for.
  const selected = backend()?.selectedText() ?? ''
  if (selected.length > 0) findState.query = selected

  findState.open = true
  findState.replaceMode = replaceMode
  applyQuery()
}

export function closeFind(): void {
  findState.open = false
  backend()?.clear()
}
