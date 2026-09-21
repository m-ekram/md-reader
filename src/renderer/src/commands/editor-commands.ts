/**
 * Paragraph and Format menu commands.
 *
 * These are thin wrappers over commands the editor presets already provide, so
 * the work here is mapping menu ids onto them and deciding what "enabled" means
 * — not reimplementing formatting.
 *
 * Commands the editor owns outright (undo, clipboard, Tab) are deliberately
 * absent: they are listed in EDITOR_DELEGATED and must never be bound at the
 * application level, or they stop reaching the editor. See registry.ts.
 */
import {
  createCodeBlockCommand,
  downgradeHeadingCommand,
  insertHrCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  turnIntoTextCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  sinkListItemCommand,
  liftListItemCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  deleteSelectedCellsCommand,
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm'
import { activeDoc } from '../stores/documents'
import { caretIn, hasEditor, refreshDecorations, runCommand as run, withView } from '../editor/view'
import { registerAll, type Command } from './registry'
import { flushAll } from '../editor/pool'
import { ALERT_KINDS } from '../editor/alerts'
import { find, findState, openFind } from '../editor/find'
import { setEditorModes } from '../editor/typewriter'
import { patchSettings, useSettingsStore } from '../stores/settings'

/** Source mode has no pooled editor, so commands that only need a document. */
const hasDocument = () => activeDoc.value !== null
const settings = useSettingsStore()

/** True when the caret is inside a list item, at any nesting depth. */
const inListItem = (): boolean => caretIn('list_item')

/** True when the caret is inside a table, for the table-only commands. */
const inTable = (): boolean => caretIn((name) => name.startsWith('table'))

/**
 * Menu items for actions the editor owns.
 *
 * Their accelerators are deliberately never bound - see EDITOR_DELEGATED - but
 * the menu items still have to do something when clicked, or the Edit menu
 * looks broken. These route through the host, which applies them to whatever
 * has focus.
 */
const delegatedCommands: Command[] = (
  [
    ['edit.undo', 'undo'],
    ['edit.redo', 'redo'],
    ['edit.cut', 'cut'],
    ['edit.copy', 'copy'],
    ['edit.paste', 'paste'],
    ['edit.pastePlain', 'pastePlain'],
    ['edit.selectAll', 'selectAll'],
    ['edit.delete', 'delete'],
  ] as const
).map(([id, action]) => ({
  id,
  enabled: hasEditor,
  run: () => {
    window.api.edit.action(action)
    withView(() => {})
  },
}))

const editorCommands: Command[] = [
  ...delegatedCommands,
  // --- Paragraph -----------------------------------------------------------
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: `para.h${level}`,
    enabled: hasEditor,
    run: () => run(wrapInHeadingCommand.key, level),
  })),
  { id: 'para.paragraph', enabled: hasEditor, run: () => run(turnIntoTextCommand.key) },
  { id: 'para.increaseHeading', enabled: hasEditor, run: () => run(wrapInHeadingCommand.key) },
  { id: 'para.decreaseHeading', enabled: hasEditor, run: () => run(downgradeHeadingCommand.key) },

  { id: 'para.quote', enabled: hasEditor, run: () => run(wrapInBlockquoteCommand.key) },
  { id: 'para.orderedList', enabled: hasEditor, run: () => run(wrapInOrderedListCommand.key) },
  { id: 'para.unorderedList', enabled: hasEditor, run: () => run(wrapInBulletListCommand.key) },
  /**
   * List indentation.
   *
   * Tab and Shift+Tab are EDITOR_DELEGATED and never bound at the application
   * level, so these exist for the menu items, which would otherwise grey out
   * while the keys they advertise worked perfectly well.
   */
  { id: 'para.indent', enabled: inListItem, run: () => run(sinkListItemCommand.key) },
  { id: 'para.outdent', enabled: inListItem, run: () => run(liftListItemCommand.key) },

  { id: 'para.codeFence', enabled: hasEditor, run: () => run(createCodeBlockCommand.key) },
  { id: 'para.horizontalLine', enabled: hasEditor, run: () => run(insertHrCommand.key) },

  { id: 'para.insertTable', enabled: hasEditor, run: () => run(insertTableCommand.key) },
  { id: 'para.addRowAbove', enabled: inTable, run: () => run(addRowBeforeCommand.key) },
  { id: 'para.addRowBelow', enabled: inTable, run: () => run(addRowAfterCommand.key) },
  { id: 'para.addColBefore', enabled: inTable, run: () => run(addColBeforeCommand.key) },
  { id: 'para.addColAfter', enabled: inTable, run: () => run(addColAfterCommand.key) },
  { id: 'para.deleteRow', enabled: inTable, run: () => run(deleteSelectedCellsCommand.key) },
  { id: 'para.deleteCol', enabled: inTable, run: () => run(deleteSelectedCellsCommand.key) },

  // Alerts are a blockquote with an attribute, so inserting one is a wrap
  // followed by setting that attribute.
  ...ALERT_KINDS.map((kind) => ({
    id: `para.alert${kind[0].toUpperCase()}${kind.slice(1)}`,
    enabled: hasEditor,
    run: () => {
      run(wrapInBlockquoteCommand.key)
      withView((view) => {
        const { state, dispatch } = view
        const { from, to } = state.selection

        // Scanning the selected range rather than walking up from the cursor:
        // with a whole-document selection the cursor sits at depth 0 and the
        // upward walk finds nothing, which silently produced a plain quote.
        const tr = state.tr
        let touched = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name !== 'blockquote') return
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, alert: kind })
          touched = true
        })
        if (touched) dispatch(tr)
      })
    },
  })),

  // --- View ----------------------------------------------------------------
  /**
   * Source Code Mode.
   *
   * Per document rather than global: one file can be open as source while
   * another stays WYSIWYG, which is what makes it usable as the escape hatch
   * for a document too large for the rich view.
   */
  {
    id: 'view.sourceMode',
    enabled: hasDocument,
    checked: () => activeDoc.value?.sourceMode ?? false,
    run: () => {
      // The source view opens on the store's text, which lags the editor by a
      // debounce: without this, text typed just before switching was missing.
      flushAll()
      const d = activeDoc.value
      if (!d) return
      d.sourceMode = !d.sourceMode
      // The round-trip guard is about the rich view's serializer; source mode
      // writes the text verbatim, so any previous warning no longer applies.
      if (d.sourceMode) d.lossy = null
    },
  },

  /**
   * Focus and typewriter modes.
   *
   * Persisted, because they are a way of working rather than a per-document
   * choice: someone who writes in focus mode wants it on again next launch.
   */
  {
    id: 'view.focusMode',
    checked: () => settings.value.editor.focusMode,
    run: async () => {
      const next = !settings.value.editor.focusMode
      setEditorModes({ focus: next })
      refreshDecorations()
      await patchSettings({ editor: { ...settings.value.editor, focusMode: next } })
    },
  },
  {
    id: 'view.typewriter',
    checked: () => settings.value.editor.typewriter,
    run: async () => {
      const next = !settings.value.editor.typewriter
      setEditorModes({ typewriter: next })
      refreshDecorations()
      await patchSettings({ editor: { ...settings.value.editor, typewriter: next } })
    },
  },

  // --- Find and replace ----------------------------------------------------
  { id: 'edit.find', enabled: hasEditor, run: () => openFind(false) },
  { id: 'edit.replace', enabled: hasEditor, run: () => openFind(true) },
  {
    id: 'edit.findNext',
    // Only meaningful once there is something to look for.
    enabled: () => hasEditor() && findState.query.length > 0,
    run: () => find.next(),
  },
  {
    id: 'edit.findPrevious',
    enabled: () => hasEditor() && findState.query.length > 0,
    run: () => find.previous(),
  },

  // --- Format --------------------------------------------------------------
  { id: 'format.strong', enabled: hasEditor, run: () => run(toggleStrongCommand.key) },
  { id: 'format.emphasis', enabled: hasEditor, run: () => run(toggleEmphasisCommand.key) },
  { id: 'format.code', enabled: hasEditor, run: () => run(toggleInlineCodeCommand.key) },
  { id: 'format.strike', enabled: hasEditor, run: () => run(toggleStrikethroughCommand.key) },
  { id: 'format.hyperlink', enabled: hasEditor, run: () => run(toggleLinkCommand.key) },
  { id: 'format.insertImage', enabled: hasEditor, run: () => run(insertImageCommand.key) },

  /**
   * Underline and Comment have no markdown equivalent, so they emit HTML the
   * way the reference editor does. Kept deliberately: dropping them would lose
   * a formatting option people expect.
   */
  { id: 'format.underline', enabled: hasEditor, run: () => wrapSelection('<u>', '</u>') },
  { id: 'format.comment', enabled: hasEditor, run: () => wrapSelection('<!-- ', ' -->') },
]

/** Wraps the selection in literal text, for the HTML-only formats. */
function wrapSelection(before: string, after: string): void {
  withView((view) => {
    const { state, dispatch } = view
    const { from, to, empty } = state.selection
    const selected = empty ? '' : state.doc.textBetween(from, to, ' ')
    dispatch(state.tr.insertText(`${before}${selected}${after}`, from, to))
  })
}

export function registerEditorCommands(): void {
  registerAll(editorCommands)
}
