/**
 * The remaining View and Edit menu items: readonly, line endings, the
 * copy-as family, word count and spell check.
 *
 * Small enough individually that grouping them keeps `editor-commands.ts` from
 * becoming the file where everything ends up.
 */
import { editorViewCtx } from '@milkdown/kit/core'
import { activeDoc } from '../stores/documents'
import { patchSettings, useSettingsStore } from '../stores/settings'
import { registerAll, invalidateCommands, type Command } from './registry'
import { activeEditor } from '../editor/pool'
import { uiState } from '../stores/ui'
import { setPunctuation } from '../editor/punctuation'
import { setShowWhitespace, stripTrailingWhitespace } from '../editor/whitespace'
import { refreshDecorations } from '../editor/refresh'

const settings = useSettingsStore()

const hasDocument = () => activeDoc.value !== null
const hasSelectionOrDocument = hasDocument

/** The document's markdown as it would be written to disk. */
function currentMarkdown(): string {
  return activeDoc.value?.content ?? ''
}

/** The rendered HTML, taken from the editor's own DOM. */
function currentHtml(): string {
  const handle = activeEditor()
  if (!handle) return ''
  let html = ''
  handle.crepe.editor.action((ctx) => {
    try {
      html = ctx.get(editorViewCtx).dom.innerHTML
    } catch {
      html = ''
    }
  })
  return html
}

/** Markdown with the markup characters removed, for pasting into plain fields. */
function currentPlainText(): string {
  const handle = activeEditor()
  if (!handle) return currentMarkdown()
  let text = ''
  handle.crepe.editor.action((ctx) => {
    try {
      // The document's own text content: exactly what is rendered, without any
      // of the syntax that produced it.
      text = ctx.get(editorViewCtx).state.doc.textBetween(0, ctx.get(editorViewCtx).state.doc.content.size, '\n\n')
    } catch {
      text = currentMarkdown()
    }
  })
  return text
}

async function copy(text: string): Promise<void> {
  if (text.length === 0) return
  await navigator.clipboard.writeText(text)
}

const viewCommands: Command[] = [
  /**
   * Readonly mode.
   *
   * Per document and not persisted: it is a guard for the file you are reading
   * right now, not a preference.
   */
  {
    id: 'view.readonly',
    enabled: hasDocument,
    checked: () => activeDoc.value?.readonly ?? false,
    run: () => {
      const d = activeDoc.value
      if (!d) return
      d.readonly = !d.readonly
      activeEditor()?.setReadonly(d.readonly)
      invalidateCommands()
    },
  },

  {
    id: 'view.wordCount',
    enabled: hasDocument,
    checked: () => uiState.wordCountOpen,
    run: () => {
      uiState.wordCountOpen = !uiState.wordCountOpen
      invalidateCommands()
    },
  },

  {
    id: 'view.toolbar',
    checked: () => settings.value.toolbar,
    run: () => void patchSettings({ toolbar: !settings.value.toolbar }),
  },

  /**
   * Line endings.
   *
   * Recorded on the document and applied on the next save, so the choice is
   * visible in the status bar before it is written.
   */
  {
    id: 'edit.eolCrlf',
    enabled: hasDocument,
    checked: () => activeDoc.value?.eol === '\r\n',
    run: () => {
      const d = activeDoc.value
      if (!d || d.eol === '\r\n') return
      d.eol = '\r\n'
      invalidateCommands()
    },
  },
  {
    id: 'edit.eolLf',
    enabled: hasDocument,
    checked: () => activeDoc.value?.eol === '\n',
    run: () => {
      const d = activeDoc.value
      if (!d || d.eol === '\n') return
      d.eol = '\n'
      invalidateCommands()
    },
  },

  // The copy-as family. Markdown is what is on disk; HTML is what is rendered;
  // plain text is the rendered text with the syntax removed.
  { id: 'edit.copyMarkdown', enabled: hasSelectionOrDocument, run: () => copy(currentMarkdown()) },
  { id: 'edit.copyHtml', enabled: hasSelectionOrDocument, run: () => copy(currentHtml()) },
  { id: 'edit.copyPlain', enabled: hasSelectionOrDocument, run: () => copy(currentPlainText()) },
  {
    id: 'edit.copyUnstyled',
    enabled: hasSelectionOrDocument,
    // "Without theme styling" means the markup without the theme's CSS, which
    // for this application is the same as the rendered HTML: styling lives in
    // the stylesheet, never inline.
    run: () => copy(currentHtml()),
  },

  /**
   * Whitespace and line breaks.
   *
   * Showing is a persisted preference; stripping is a one-shot edit, so it is
   * enabled only when there is a document to act on.
   */
  {
    id: 'edit.showWhitespace',
    checked: () => settings.value.editor.showWhitespace,
    run: async () => {
      const next = !settings.value.editor.showWhitespace
      setShowWhitespace(next)
      refreshDecorations()
      await patchSettings({ editor: { ...settings.value.editor, showWhitespace: next } })
    },
  },
  {
    id: 'edit.stripTrailing',
    enabled: hasDocument,
    run: () => {
      const handle = activeEditor()
      handle?.crepe.editor.action((ctx) => {
        try {
          const view = ctx.get(editorViewCtx)
          const tr = stripTrailingWhitespace(view.state)
          // Null when there was nothing to strip: dispatching anyway would put
          // a no-op on the undo stack for a menu item that did nothing.
          if (tr) view.dispatch(tr)
        } catch {
          // Mid-teardown during a document switch.
        }
      })
    },
  },

  // Smart punctuation, one switch per kind.
  ...(
    [
      ['edit.smartQuotes', 'smartQuotes'],
      ['edit.smartDashes', 'smartDashes'],
      ['edit.smartEllipses', 'smartEllipses'],
    ] as const
  ).map(([id, key]) => ({
    id,
    checked: () => settings.value.editor[key],
    run: async () => {
      const next = !settings.value.editor[key]
      setPunctuation({ [key.replace('smart', '').toLowerCase()]: next })
      await patchSettings({ editor: { ...settings.value.editor, [key]: next } })
    },
  })),

  {
    id: 'edit.spellCheck',
    checked: () => settings.value.editor.spellcheck,
    run: async () => {
      const next = !settings.value.editor.spellcheck
      window.api.window.setSpellcheck(next)
      await patchSettings({ editor: { ...settings.value.editor, spellcheck: next } })
    },
  },
]

export function registerViewCommands(): void {
  registerAll(viewCommands)
}
