/**
 * The notes suggested while a `[[wiki link]]` is typed.
 *
 * editor/wiki-suggest.ts says what is being typed; this picks the notes from
 * the open folder (utils/wiki-resolve) and holds the list WikiSuggest.vue
 * shows. There is one list for the window, owned by one editor at a time.
 */
import { ref, watch } from 'vue'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  dismissWikiSuggest,
  insertWikiLink,
  type WikiQuery,
  type WikiSuggestHooks,
} from '../editor/wiki-suggest'
import { wikiCandidates, type WikiCandidate } from '../utils/wiki-resolve'
import { refreshArticles, useWorkspace } from './workspace'

export interface WikiSuggestion {
  docId: string
  at: WikiQuery
  items: WikiCandidate[]
  selected: number
  /** Where the `[[` is on screen, to show the list under it. */
  left: number
  top: number
  bottom: number
}

export const wikiSuggestion = ref<WikiSuggestion | null>(null)

/** The editor the list is for, to put the choice in. */
let owner: { view: EditorView; documentPath: () => string | null } | null = null

/** The editor's element, while the list is for it. */
export function wikiSuggestionEditor(): HTMLElement | null {
  return owner?.view.dom ?? null
}

export function closeWikiSuggestion(): void {
  wikiSuggestion.value = null
  owner = null
}

/** Lists the notes that fit `at`; false, and nothing shown, when none do. */
function show(
  docId: string,
  view: EditorView,
  documentPath: () => string | null,
  at: WikiQuery
): boolean {
  const items = wikiCandidates(at.query, documentPath(), useWorkspace().articles)
  if (items.length === 0) {
    if (wikiSuggestion.value?.docId === docId) closeWikiSuggestion()
    return false
  }
  // The same note stays picked as more of its name is typed.
  const prev = wikiSuggestion.value
  const picked =
    prev?.docId === docId && prev.at.from === at.from ? prev.items[prev.selected]?.path : null
  const coords = view.coordsAtPos(at.from - 2)
  wikiSuggestion.value = {
    docId,
    at,
    items,
    selected: Math.max(
      0,
      items.findIndex((i) => i.path === picked)
    ),
    left: coords.left,
    top: coords.top,
    bottom: coords.bottom,
  }
  owner = { view, documentPath }
  return true
}

// Notes made, renamed or removed while the list shows, or the folder's list
// arriving after the typing started.
watch(
  () => useWorkspace().articles,
  () => {
    const s = wikiSuggestion.value
    if (s && owner) show(s.docId, owner.view, owner.documentPath, s.at)
  }
)

/** Puts the `index`th note in as the link's name. */
export function acceptWikiSuggestion(index: number): void {
  const s = wikiSuggestion.value
  const view = owner?.view
  const item = s?.items[index]
  if (!s || !view || !item) return
  closeWikiSuggestion()
  view.dispatch(insertWikiLink(view.state, s.at, item.insert))
  view.focus()
}

export function wikiSuggestHooks(
  docId: string,
  documentPath: () => string | null
): WikiSuggestHooks {
  const close = (): false => {
    if (wikiSuggestion.value?.docId === docId) closeWikiSuggestion()
    return false
  }
  return {
    update(view, at) {
      const ws = useWorkspace()
      if (!at || !ws.root) return close()
      // Read when the folder opens; still on its way when typing starts early.
      if (ws.articles.length === 0 && !ws.loadingArticles) void refreshArticles()
      return show(docId, view, documentPath, at)
    },
    keydown(view, event) {
      const s = wikiSuggestion.value
      if (!s || s.docId !== docId) return false
      if (event.ctrlKey || event.altKey || event.metaKey) return false
      switch (event.key) {
        case 'ArrowDown':
          s.selected = (s.selected + 1) % s.items.length
          return true
        case 'ArrowUp':
          s.selected = (s.selected - 1 + s.items.length) % s.items.length
          return true
        case 'Enter':
        case 'Tab':
          if (event.shiftKey) return false
          acceptWikiSuggestion(s.selected)
          return true
        case 'Escape':
          closeWikiSuggestion()
          dismissWikiSuggest(view)
          return true
        default:
          return false
      }
    },
  }
}
