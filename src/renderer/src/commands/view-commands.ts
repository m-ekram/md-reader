/**
 * The remaining View and Edit menu items: readonly, line endings, the
 * copy-as family, word count and spell check.
 *
 * Small enough individually that grouping them keeps `editor-commands.ts` from
 * becoming the file where everything ends up.
 */
import { activeDoc } from '../stores/documents'
import { patchSettings, useSettingsStore } from '../stores/settings'
import { registerAll, invalidateCommands, type Command } from './registry'
import { flushAll } from '../editor/pool'
import { shownSourceFor } from '../editor/source-registry'
import { uiState } from '../stores/ui'
import { setPunctuation } from '../editor/punctuation'
import { setShowWhitespace, stripTrailingWhitespace } from '../editor/whitespace'
import { activeEditor, fromView, refreshDecorations, withView } from '../editor/view'
import { cleanForExport } from '../export/clean'
import { DOMSerializer, type Fragment } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core'

const settings = useSettingsStore()

const hasDocument = () => activeDoc.value !== null
/** A document whose line endings may change: not a readonly one. */
const hasWritableDocument = () => hasDocument() && activeDoc.value?.readonly !== true
const hasSelectionOrDocument = hasDocument

/** The document's markdown as it would be written to disk. */
function currentMarkdown(): string {
  // Read from the store, which lags the editor by a debounce: without the
  // flush, copying straight after typing left out the last keystrokes.
  flushAll()
  return activeDoc.value?.content ?? ''
}

/**
 * What the copy-as commands copy: the selection, or the whole document when
 * nothing is selected. They used to copy the whole document regardless.
 */
function copiedFragment(view: EditorView): Fragment {
  const { selection, doc } = view.state
  return selection.empty ? doc.content : selection.content().content
}

/**
 * The HTML of what is copied, built from the document itself. It used to be
 * the editor's own working DOM, full of its node views and class names.
 */
function copiedHtml(unstyled: boolean): string {
  return fromView((view) => {
    const holder = document.createElement('div')
    holder.appendChild(
      DOMSerializer.fromSchema(view.state.schema).serializeFragment(copiedFragment(view))
    )
    const out = document.createElement('div')
    out.innerHTML = cleanForExport(holder)
    if (unstyled) {
      for (const el of Array.from(out.querySelectorAll('[class], [style]'))) {
        el.removeAttribute('class')
        el.removeAttribute('style')
      }
    }
    return out.innerHTML
  }, '')
}

/** The text of what is copied, without the syntax that produced it. */
function copiedText(): string {
  // Source mode has no formatted view, so it falls back to the markdown.
  return fromView((view) => {
    const { selection, doc } = view.state
    return selection.empty
      ? doc.textBetween(0, doc.content.size, '\n\n')
      : doc.textBetween(selection.from, selection.to, '\n\n')
  }, currentMarkdown())
}

/** The selection as markdown, or the whole document. */
function copiedMarkdown(): string {
  const handle = activeEditor()
  if (!handle) return currentMarkdown()
  let out: string | null = null
  handle.crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (view.state.selection.empty) return
    const doc = view.state.schema.topNodeType.createAndFill(null, copiedFragment(view))
    if (doc) out = ctx.get(serializerCtx)(doc).trimEnd() + '\n'
  })
  return out ?? currentMarkdown()
}

/**
 * Through main: the page's clipboard refuses a write while its window is not
 * the focused one, and a copy then failed now and then in the test runs, where
 * several windows are open at once.
 */
async function copy(text: string): Promise<void> {
  if (text.length === 0) return
  await window.api.clipboard.write({ text })
}

/** Formatted text for pasting into mail or a word processor, with plain text beside it. */
async function copyFormatted(html: string, text: string): Promise<void> {
  if (html.length === 0) return
  await window.api.clipboard.write({ text, html })
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
      shownSourceFor(d.id)?.setReadonly(d.readonly)
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
    enabled: hasWritableDocument,
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
    enabled: hasWritableDocument,
    checked: () => activeDoc.value?.eol === '\n',
    run: () => {
      const d = activeDoc.value
      if (!d || d.eol === '\n') return
      d.eol = '\n'
      invalidateCommands()
    },
  },

  // The copy-as family, each of the selection or else the whole document.
  // Markdown is what is on disk; HTML Code is clean markup, as text; Plain
  // Text is the rendered text with the syntax removed; without theme styling
  // is formatted text, for pasting into mail or a word processor.
  { id: 'edit.copyMarkdown', enabled: hasSelectionOrDocument, run: () => copy(copiedMarkdown()) },
  { id: 'edit.copyHtml', enabled: hasSelectionOrDocument, run: () => copy(copiedHtml(false)) },
  { id: 'edit.copyPlain', enabled: hasSelectionOrDocument, run: () => copy(copiedText()) },
  {
    id: 'edit.copyUnstyled',
    enabled: hasSelectionOrDocument,
    // It copied markup as text, the same as HTML Code: pasted into a mail, it
    // came out as tags.
    run: () => copyFormatted(copiedHtml(true), copiedText()),
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
      await patchSettings({ editor: { showWhitespace: next } })
    },
  },
  {
    id: 'edit.stripTrailing',
    enabled: hasDocument,
    run: () =>
      withView((view) => {
        const tr = stripTrailingWhitespace(view.state)
        // Null when there was nothing to strip: dispatching anyway would put a
        // no-op on the undo stack for a menu item that did nothing.
        if (tr) view.dispatch(tr)
      }),
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
      await patchSettings({ editor: { [key]: next } })
    },
  })),

  {
    id: 'edit.spellCheck',
    checked: () => settings.value.editor.spellcheck,
    run: async () => {
      const next = !settings.value.editor.spellcheck
      window.api.window.setSpellcheck(next)
      await patchSettings({ editor: { spellcheck: next } })
    },
  },
]

export function registerViewCommands(): void {
  registerAll(viewCommands)
}
