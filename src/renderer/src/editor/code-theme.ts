/**
 * Code block colours, taken from the theme in force.
 *
 * Crepe ships its code blocks with a fixed dark palette. On a light theme that
 * left plain code pale grey on a pale ground and the line number on a dark
 * box. Everything here is a CSS variable instead, so a code block follows the
 * theme like the rest of the page, including a theme switch while it is open:
 * no editor is rebuilt, the variables simply resolve to new values.
 *
 * The syntax tokens (`--syntax-*`) default in `themes/contract.css` to a
 * palette for light pages; dark themes redefine them.
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const surface = EditorView.theme({
  '&': { color: 'var(--code-fg)', backgroundColor: 'var(--code-bg)' },
  '.cm-content': { caretColor: 'var(--code-fg)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--code-fg)' },
  '.cm-gutters': {
    backgroundColor: 'var(--code-bg)',
    color: 'var(--syntax-comment)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--code-fg) 5%, transparent)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--code-fg)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--doc-selection)' },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--doc-accent) 20%, transparent)',
  },
})

const highlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword],
    color: 'var(--syntax-keyword)',
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.inserted], color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: 'var(--syntax-number)' },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta],
    color: 'var(--syntax-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: 'var(--syntax-function)',
  },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--syntax-type)' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--syntax-property)' },
  { tag: [t.deleted, t.invalid], color: 'var(--danger)' },
  { tag: t.heading, fontWeight: 'bold', color: 'var(--syntax-keyword)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.link, color: 'var(--doc-accent)', textDecoration: 'underline' },
])

export const codeTheme: Extension = [surface, syntaxHighlighting(highlight)]
