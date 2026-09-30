/**
 * Focus for an overlay: kept inside while it is open, and given back when it
 * closes.
 *
 * Closing the palette, Open Quickly or Preferences left the focus on the page
 * itself, so the next keystrokes went nowhere; and Tab walked out of a modal
 * dialog into the document behind it.
 *
 * The focus goes back only if it went down with the overlay. A command run
 * from the palette may have moved it on purpose (into the document, or into
 * another dialog), and that is left alone.
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )
}

export function useFocusTrap(
  panel: Ref<HTMLElement | null>,
  open: () => boolean,
  opts: { trap: boolean } = { trap: true }
): void {
  let opener: HTMLElement | null = null
  let openerRange: Range | null = null

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab' || !opts.trap || !panel.value) return
    const items = focusable(panel.value)
    if (items.length === 0) {
      e.preventDefault()
      panel.value.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    const inside = at instanceof Node && panel.value.contains(at)
    if (e.shiftKey && (at === first || !inside)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (at === last || !inside)) {
      e.preventDefault()
      first.focus()
    }
  }

  const giveBack = (): void => {
    const target = opener
    const range = openerRange
    opener = null
    openerRange = null
    const at = document.activeElement
    const lost = !at || at === document.body
    if (!lost || !target?.isConnected) return
    target.focus()
    // Focusing an editable element puts the caret at its start, and the
    // document's editor takes that up: typing went on at the top. The
    // selection as it was is put back, where it is still in the page.
    if (
      range &&
      range.startContainer.isConnected &&
      range.endContainer.isConnected &&
      target.contains(range.startContainer)
    ) {
      const sel = getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  // Synchronously, so the opener is read before the overlay takes the focus.
  watch(
    open,
    (isOpen) => {
      if (isOpen) {
        const at = document.activeElement
        opener = at instanceof HTMLElement && at !== document.body ? at : null
        const sel = getSelection()
        openerRange = opener && sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
        window.addEventListener('keydown', onKeydown, true)
      } else {
        window.removeEventListener('keydown', onKeydown, true)
      }
    },
    { flush: 'sync' }
  )

  // After the overlay has left the page, so its going took the focus with it.
  watch(
    open,
    (isOpen) => {
      if (!isOpen) giveBack()
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
