/**
 * The source view on screen, and whose document it is.
 *
 * Set by the editor host as it shows a document as source, and cleared when
 * it takes the view down. Kept apart from `sourceMode.ts`, which is loaded
 * only on first use, so asking "is there one?" never loads CodeMirror.
 */
import type { SourceHandle } from './sourceMode'

let shown: { docId: string; handle: SourceHandle } | null = null

export function setShownSource(docId: string, handle: SourceHandle): void {
  shown = { docId, handle }
}

export function clearShownSource(handle: SourceHandle | null): void {
  if (shown && (handle === null || shown.handle === handle)) shown = null
}

/** The source view showing `docId`, or null. */
export function shownSourceFor(docId: string): SourceHandle | null {
  return shown && shown.docId === docId ? shown.handle : null
}
