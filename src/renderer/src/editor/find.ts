/**
 * Find and replace inside the active document.
 *
 * Built on prosemirror-search, which owns the match highlighting and the
 * cursor-advancing commands. What is added here is the glue: a reactive state
 * the panel binds to, a match count, and the plumbing to run those commands
 * against whichever pooled editor is on screen.
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
  replaceCurrent,
  replaceNext,
  search,
  setSearchState,
} from 'prosemirror-search'
import { $prose } from '@milkdown/kit/utils'
import { editorViewCtx } from '@milkdown/kit/core'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { activeEditor } from './pool'

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

function view(): EditorView | null {
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

function buildQuery(): SearchQuery {
  return new SearchQuery({
    search: findState.query,
    replace: findState.replacement,
    caseSensitive: findState.caseSensitive,
    wholeWord: findState.wholeWord,
  })
}

/**
 * Counts matches and works out which one the selection is sitting in.
 *
 * prosemirror-search highlights matches but does not report a total, and "3 of
 * 12" is the part people actually read.
 */
function countMatches(state: EditorState, query: SearchQuery): { total: number; current: number } {
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

/** Pushes the current query into the editor and refreshes the counts. */
export function applyQuery(): void {
  const v = view()
  if (!v) {
    findState.matches = 0
    findState.current = 0
    return
  }

  const query = buildQuery()
  v.dispatch(setSearchState(v.state.tr, query))

  const { total, current } = countMatches(v.state, query)
  findState.matches = total
  findState.current = current
}

function runCommand(command: (s: EditorState, d?: EditorView['dispatch']) => boolean): void {
  const v = view()
  if (!v) return

  // Push the current query first. The replace commands read the replacement
  // out of the *editor's* stored query, and that was only being written when
  // the search term changed — so typing a replacement and pressing Replace
  // substituted an empty string, or did nothing at all.
  v.dispatch(setSearchState(v.state.tr, buildQuery()))

  command(v.state, v.dispatch)
  v.focus()

  // The selection moved, so "3 of 12" needs recomputing.
  const { total, current } = countMatches(v.state, buildQuery())
  findState.matches = total
  findState.current = current
}

/**
 * Replaces the match under the selection, or the next one if the selection is
 * not sitting on a match.
 *
 * `replaceNext` on its own only *selects* the next match when nothing is
 * selected, so a single click of Replace appeared to do nothing and people
 * press it twice. Selecting first makes one press mean one replacement.
 */
function replaceOneAndAdvance(): void {
  const v = view()
  if (!v) return

  const query = buildQuery()
  if (!query.valid) return

  const { current } = countMatches(v.state, query)
  if (current === 0) runCommand(findNext)
  runCommand(replaceNext)
}

export const find = {
  next: () => runCommand(findNext),
  previous: () => runCommand(findPrev),
  replaceOne: () => runCommand(replaceCurrent),
  replaceAndAdvance: replaceOneAndAdvance,
  replaceEverything: () => runCommand(replaceAll),
}

/** Opens the panel, seeding it from the selection when there is one. */
export function openFind(replaceMode: boolean): void {
  const v = view()
  if (v && !v.state.selection.empty) {
    const selected = v.state.doc.textBetween(v.state.selection.from, v.state.selection.to, ' ')
    // Only a single line: a multi-line selection is a range to search within,
    // not a term to search for.
    if (selected.length > 0 && !selected.includes('\n')) findState.query = selected
  }

  findState.open = true
  findState.replaceMode = replaceMode
  applyQuery()
}

export function closeFind(): void {
  findState.open = false
  const v = view()
  if (!v) return
  // Clear the highlights, otherwise they linger over the document.
  v.dispatch(setSearchState(v.state.tr, new SearchQuery({ search: '' })))
  v.focus()
}
