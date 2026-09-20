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
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'

export interface SourceHandle {
  view: EditorView
  getContent(): string
  destroy(): void
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
  onChange: (text: string) => void
}): SourceHandle {
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
        EditorView.lineWrapping,
        appearance(opts.dark),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) opts.onChange(update.state.doc.toString())
        }),
      ],
    }),
  })

  return {
    view,
    getContent: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  }
}
