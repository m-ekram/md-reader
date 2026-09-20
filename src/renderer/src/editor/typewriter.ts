/**
 * Focus mode and typewriter scrolling.
 *
 * Focus mode dims everything except the block the caret is in. Typewriter mode
 * keeps that block near the vertical middle of the window, so the line you are
 * writing does not creep toward the bottom edge.
 *
 * Both are presentation over the existing view: focus marks the active block
 * with a decoration and lets CSS do the dimming, and typewriter adjusts the
 * scroll position. Neither touches the document, so neither can affect what is
 * saved.
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'

/**
 * Read at render time rather than injected, because the plugin is created once
 * per editor while the modes are toggled at any moment.
 */
export const typewriterModes = {
  focus: false,
  typewriter: false,
}

export function setEditorModes(modes: { focus?: boolean; typewriter?: boolean }): void {
  if (modes.focus !== undefined) typewriterModes.focus = modes.focus
  if (modes.typewriter !== undefined) typewriterModes.typewriter = modes.typewriter
  document.documentElement.classList.toggle('focus-mode', typewriterModes.focus)
}

/** Marks the top-level block containing the caret. */
function focusDecorations(state: EditorState): DecorationSet {
  if (!typewriterModes.focus) return DecorationSet.empty

  const { $from } = state.selection
  // depth 1 is the top-level block; anything deeper is inside a list or quote,
  // and dimming per-paragraph inside a list reads better than dimming the list.
  const depth = Math.min($from.depth, 1)
  if (depth < 1) return DecorationSet.empty

  const from = $from.before(depth)
  const to = $from.after(depth)
  return DecorationSet.create(state.doc, [Decoration.node(from, to, { class: 'is-focused-block' })])
}

/**
 * Scrolls so the caret sits near the middle.
 *
 * Only when it has actually moved away from the middle band, or every keystroke
 * would fight the user's own scrolling.
 */
function centreCaret(view: EditorView): void {
  if (!typewriterModes.typewriter) return

  const coords = view.coordsAtPos(view.state.selection.head)
  const scroller = view.dom.closest('.editor-scroll') as HTMLElement | null
  if (!scroller) return

  const box = scroller.getBoundingClientRect()
  const middle = box.top + box.height / 2
  const drift = coords.top - middle

  // A dead band, so small movements within the middle third do not scroll.
  if (Math.abs(drift) < box.height * 0.15) return
  scroller.scrollBy({ top: drift, behavior: 'auto' })
}

const key = new PluginKey('ekram-typewriter')

export const typewriterPlugin: MilkdownPlugin[] = [
  $prose(
    () =>
      new Plugin({
        key,
        state: {
          init: (_config, state) => focusDecorations(state),
          apply: (_tr, _value, _old, newState) => focusDecorations(newState),
        },
        props: {
          decorations(state) {
            return key.getState(state) as DecorationSet | undefined
          },
        },
        view: () => ({
          update: (view, prev) => {
            if (view.state.selection.eq(prev.selection) && view.state.doc.eq(prev.doc)) return
            // After the DOM has settled, or the coordinates are the old ones.
            requestAnimationFrame(() => centreCaret(view))
          },
        }),
      })
  ),
] as MilkdownPlugin[]
