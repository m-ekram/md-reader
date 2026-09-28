/**
 * The shape shared by the two editors' find: the formatted view's, over
 * prosemirror-search, and the source view's, over CodeMirror's search. Types
 * only, so the source view's code is not loaded just to name them.
 */

export interface FindQuerySpec {
  search: string
  replace: string
  caseSensitive: boolean
  wholeWord: boolean
}

/** How many matches, and which (1-based) the selection is on, else 0. */
export interface FindCounts {
  total: number
  current: number
}

export type FindAction = 'next' | 'previous' | 'replaceAndAdvance' | 'replaceAll'

export interface FindBackend {
  /** Highlights the query's matches, and counts them. Leaves focus alone. */
  apply(query: FindQuerySpec): FindCounts
  /** Runs an action, brings its match into view, and counts again. */
  run(action: FindAction, query: FindQuerySpec): FindCounts
  /** The selected text when it is on one line, else ''. Seeds the find box. */
  selectedText(): string
  /** Removes the highlights and gives the document its focus back. */
  clear(): void
}
