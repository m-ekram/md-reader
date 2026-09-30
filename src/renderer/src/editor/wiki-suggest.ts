/**
 * Suggesting notes while a `[[wiki link]]` is typed.
 *
 * The plugin only notices: after each change it says whether the caret is
 * after an unclosed `[[`, and what has been typed since, and it hands the keys
 * a showing list wants (arrows, Enter, Tab, Escape) to whoever shows it. The
 * list is WikiSuggest.vue, fed by stores/wiki-suggest.ts.
 *
 * Only typing opens it. Moving the caret into a link, or Ctrl+clicking one to
 * follow it, does not. Nor does text still being composed by an input method:
 * the list waits for the composed text.
 */
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'

export interface WikiQuery {
  /** What has been typed after `[[`. */
  query: string
  /** Where the name starts, just after `[[`. */
  from: number
  /** The caret. */
  to: number
}

export interface WikiSuggestHooks {
  /** The link being typed, or null for none; returns whether a list now shows. */
  update(view: EditorView, at: WikiQuery | null): boolean
  /** A key pressed while the list shows; true when the list used it. */
  keydown(view: EditorView, event: KeyboardEvent): boolean
}

/** An unclosed `[[`, and the name typed after it, up to the caret. */
const OPEN = /\[\[([^[\]\n|#]*)$/
/** The rest of a name after the caret, up to what closes it. */
const REST = /^([^[\]\n|#]*)(\]\]|\||#)/
/** How far either side of the caret a link is looked for. */
const REACH = 200

export function wikiQueryAt(state: EditorState): WikiQuery | null {
  const { selection } = state
  if (!selection.empty) return null
  const $pos = selection.$from
  const parent = $pos.parent
  if (!parent.isTextblock || parent.type.spec.code) return null
  if ($pos.marks().some((m) => m.type.spec.code)) return null
  const before = parent.textBetween(
    Math.max(0, $pos.parentOffset - REACH),
    $pos.parentOffset,
    undefined,
    '￼'
  )
  const m = OPEN.exec(before)
  if (!m) return null
  return { query: m[1], from: $pos.pos - m[1].length, to: $pos.pos }
}

export const wikiSuggestKey = new PluginKey<number>('wiki-suggest')

/**
 * Puts `insert` in as the link's name, closing the link unless it already is.
 *
 * The caret ends after the closing brackets, or before a `#heading` or
 * `|label` that follows the name. The list stays shut for that link after.
 */
export function insertWikiLink(state: EditorState, at: WikiQuery, insert: string): Transaction {
  const $to = state.doc.resolve(at.to)
  const after = $to.parent.textBetween(
    $to.parentOffset,
    Math.min($to.parent.content.size, $to.parentOffset + REACH),
    undefined,
    '￼'
  )
  const rest = REST.exec(after)
  const end = at.to + (rest ? rest[1].length : 0)
  const tr = state.tr.insertText(rest ? insert : `${insert}]]`, at.from, end)
  const caret = at.from + insert.length + (!rest || rest[2] === ']]' ? 2 : 0)
  return tr
    .setSelection(TextSelection.create(tr.doc, caret))
    .setMeta(wikiSuggestKey, at.from)
    .scrollIntoView()
}

/** Closes the list for the link being typed, until the caret leaves it. */
export function dismissWikiSuggest(view: EditorView): void {
  const at = wikiQueryAt(view.state)
  if (at) view.dispatch(view.state.tr.setMeta(wikiSuggestKey, at.from))
}

export function wikiSuggestPlugin(hooks: WikiSuggestHooks): Plugin<number> {
  let showing = false
  return new Plugin<number>({
    key: wikiSuggestKey,
    // Where the link starts whose list was closed (Escape, or a choice made);
    // -1 for none. Forgotten once the caret is out of that link.
    state: {
      init: () => -1,
      apply(tr, closed, _old, next) {
        const meta = tr.getMeta(wikiSuggestKey) as number | undefined
        if (meta !== undefined) return meta
        if (closed < 0) return closed
        const mapped = tr.mapping.map(closed)
        return wikiQueryAt(next)?.from === mapped ? mapped : -1
      },
    },
    view: (editorView) => ({
      update(view, prev) {
        if (!showing && view.state.doc === prev.doc) return
        if (view.composing) return
        const at = view.hasFocus() ? wikiQueryAt(view.state) : null
        const closed = wikiSuggestKey.getState(view.state)
        showing = hooks.update(view, at && at.from !== closed ? at : null)
      },
      destroy() {
        if (showing) showing = hooks.update(editorView, null)
      },
    }),
    props: {
      handleDOMEvents: {
        // Here, not handleKeyDown: DOM handlers run before any plugin's
        // handleKeyDown, so while the list shows no keymap acts on its keys
        // first, whatever order the plugins were added in.
        keydown(view, event) {
          if (!showing || view.composing || event.isComposing) return false
          if (!hooks.keydown(view, event)) return false
          event.preventDefault()
          return true
        },
        blur(view) {
          if (showing) showing = hooks.update(view, null)
          return false
        },
      },
    },
  })
}
