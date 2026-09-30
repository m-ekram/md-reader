/**
 * Source Code Mode: the raw markdown, in CodeMirror.
 *
 * Two jobs. The obvious one is letting you see and edit exactly what will be
 * written to disk, which matters for a WYSIWYG editor that re-serializes on
 * save. The other is the escape hatch Phase 0 asked for: past about ten
 * thousand lines the ProseMirror view costs 96 ms per keystroke, where
 * CodeMirror stays responsive because it only renders the visible window.
 *
 * The text is the document's own `content`, so switching modes is not a
 * conversion — both views edit the same string.
 */
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  SearchQuery,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  setSearchQuery,
} from '@codemirror/search'
import type { FindBackend, FindCounts, FindQuerySpec } from './find-types'

export interface SourceHandle {
  view: EditorView
  getContent(): string
  /** Find and replace, driven by the app's own find bar. */
  find: FindBackend
  /** Readonly, as the formatted view is for the same document. */
  setReadonly(readonly: boolean): void
  /** Puts the caret at the start of a 1-based line and scrolls it to the top. */
  revealLine(line: number): void
  destroy(): void
}

/** Neither typing nor any other change: the document itself refuses them. */
function readonlyExtensions(readonly: boolean): Extension {
  return [EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]
}

/**
 * CodeMirror's search, with the app's find bar in place of its panel.
 *
 * CodeMirror draws match highlights only while its panel is open, so the panel
 * is opened, as an empty hidden element: the bar the user sees is the same one
 * the formatted view uses. Its keymap is left out, because the app's own
 * accelerators already own Ctrl+F, F3 and the rest.
 */
const hiddenSearchPanel = search({
  createPanel: () => {
    const dom = document.createElement('div')
    dom.style.display = 'none'
    return { dom }
  },
})

function sourceFind(view: EditorView): FindBackend {
  const push = (q: FindQuerySpec): void => {
    if (!searchPanelOpen(view.state)) openSearchPanel(view)
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...q })) })
  }

  const counts = (): FindCounts => {
    const query = getSearchQuery(view.state)
    if (!query.valid) return { total: 0, current: 0 }
    const sel = view.state.selection.main
    let total = 0
    let current = 0
    const cursor = query.getCursor(view.state)
    // Bounded, as the formatted view's count is.
    for (let r = cursor.next(); !r.done && total < 10_000; r = cursor.next()) {
      total++
      if (r.value.from <= sel.from && r.value.to >= sel.to) current = total
    }
    return { total, current }
  }

  return {
    apply(q) {
      push(q)
      return counts()
    },
    run(action, q) {
      push(q)
      // The find bar keeps the focus, as in the formatted view (see find.ts).
      if (!document.activeElement?.closest('.find')) view.focus()
      if (action === 'next') findNext(view)
      else if (action === 'previous') findPrevious(view)
      else if (action === 'replaceAll') replaceAll(view)
      else {
        // One press, one replacement: on no match, go to one first.
        if (counts().current === 0) findNext(view)
        replaceNext(view)
      }
      return counts()
    },
    selectMatch(index, q) {
      push(q)
      const query = getSearchQuery(view.state)
      if (query.valid) {
        let found: { from: number; to: number } | null = null
        const cursor = query.getCursor(view.state)
        for (let i = 0, r = cursor.next(); !r.done && i <= index; i++, r = cursor.next()) {
          found = r.value
        }
        if (found) {
          view.dispatch({
            selection: { anchor: found.from, head: found.to },
            effects: EditorView.scrollIntoView(found.from, { y: 'center' }),
          })
        }
      }
      return counts()
    },
    selectedText() {
      const { from, to } = view.state.selection.main
      const text = view.state.sliceDoc(from, to)
      return text.includes('\n') ? '' : text
    },
    clear() {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
      view.focus()
    },
  }
}

/** Matches the document area rather than CodeMirror's own defaults. */
function appearance(dark: boolean): Extension {
  const theme = EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: 'var(--code-font-size, 14px)',
        backgroundColor: 'var(--doc-bg)',
        color: 'var(--doc-fg)',
      },
      '.cm-content': {
        fontFamily: 'var(--code-font)',
        padding: '16px 0',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--doc-bg)',
        color: 'var(--doc-muted)',
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: 'var(--code-bg)' },
      // The same colours as the formatted view's matches.
      '.cm-searchMatch': { backgroundColor: 'var(--find-match)' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--find-match-current)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--code-bg)' },
      '&.cm-focused': { outline: 'none' },
    },
    { dark }
  )
  return dark ? [theme, oneDark] : [theme, syntaxHighlighting(defaultHighlightStyle)]
}

export function createSourceEditor(opts: {
  root: HTMLElement
  value: string
  dark: boolean
  readonly?: boolean
  onChange: (text: string) => void
  /** The caret's 1-based line, as it moves. */
  onCaret?: (line: number) => void
}): SourceHandle {
  const readonlyCompartment = new Compartment()
  const view = new EditorView({
    parent: opts.root,
    state: EditorState.create({
      doc: opts.value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        // The editor's own keymap, so undo and the usual editing keys work
        // here too. App accelerators are unaffected: the ones the editor owns
        // are never bound at application level.
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        hiddenSearchPanel,
        readonlyCompartment.of(readonlyExtensions(opts.readonly === true)),
        EditorView.lineWrapping,
        appearance(opts.dark),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) opts.onChange(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) {
            opts.onCaret?.(update.state.doc.lineAt(update.state.selection.main.head).number)
          }
        }),
      ],
    }),
  })

  // The caret starts on the first line, and no update says so.
  opts.onCaret?.(1)

  return {
    view,
    getContent: () => view.state.doc.toString(),
    find: sourceFind(view),
    setReadonly: (readonly) =>
      view.dispatch({ effects: readonlyCompartment.reconfigure(readonlyExtensions(readonly)) }),
    revealLine: (line) => {
      const { doc } = view.state
      const at = doc.line(Math.min(Math.max(1, line), doc.lines)).from
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 16 }),
      })
      view.focus()
    },
    destroy: () => view.destroy(),
  }
}
