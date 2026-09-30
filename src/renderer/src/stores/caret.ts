/**
 * Where the caret is in the document on screen, for what follows it (the
 * outline's current heading).
 *
 * The two views report it in their own terms: the formatted view counts the
 * headings before the caret, since it has no line numbers; the source view
 * gives the caret's line. Both report at most once a frame.
 */
import { reactive } from 'vue'

export const caret = reactive({
  docId: '',
  /** 'heading': `value` is how many top-level headings precede the caret, less one. */
  kind: 'heading' as 'heading' | 'line',
  value: -1,
})

export function reportCaret(docId: string, kind: 'heading' | 'line', value: number): void {
  if (caret.docId === docId && caret.kind === kind && caret.value === value) return
  caret.docId = docId
  caret.kind = kind
  caret.value = value
}

/** The index of the heading the caret is under, among `lines` (1-based, in order). */
export function currentHeading(docId: string, headingLines: readonly number[]): number {
  if (caret.docId !== docId) return -1
  if (caret.kind === 'heading') return Math.min(caret.value, headingLines.length - 1)
  let at = -1
  for (let i = 0; i < headingLines.length && headingLines[i] <= caret.value; i++) at = i
  return at
}
