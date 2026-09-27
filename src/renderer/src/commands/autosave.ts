/**
 * Saving automatically, when Preferences > Files > Save automatically is on.
 *
 * A document is saved a moment after typing stops, and at once when the window
 * loses focus or closes. Only documents that already have a file: an Untitled
 * one would need a name, and auto-save never asks. Not a document the
 * round-trip guard warned about either, since saving it loses what it could
 * not keep; that is for the user to choose, with Ctrl+S.
 *
 * It never overwrites another program's change. The save is refused when the
 * file changed since it was read, the user is told, and auto-save leaves that
 * document alone until they save or reload it themselves.
 */
import { watch } from 'vue'
import { explainSaveError } from '../../../shared/save-errors'
import { flushAll } from '../editor/pool'
import { isDirty, useDocuments, type Doc } from '../stores/documents'
import { useSettingsStore } from '../stores/settings'
import { showNotice } from '../stores/ui'
import { logError } from '../utils/report'
import { saveInPlace } from './app-commands'

/** How long typing must pause before a save. */
export const AUTOSAVE_AFTER_MS = 1000

/**
 * Documents a refused save left alone, by id, with the file time they were
 * refused at. A save or reload by the user moves that time, which ends it.
 */
const heldAt = new Map<string, number>()

/** Whether auto-save may write this document now. Pure, for testing. */
export function autoSavable(d: Doc, held: ReadonlyMap<string, number> = heldAt): boolean {
  return (
    d.path !== null &&
    isDirty(d) &&
    !d.readonly &&
    !d.detached &&
    d.helpTopic === undefined &&
    d.lossy?.lossy !== true &&
    held.get(d.id) !== d.mtimeMs
  )
}

let timer: number | undefined
let running: Promise<void> | null = null

async function saveAll(): Promise<void> {
  for (const d of useDocuments().docs.filter((doc) => autoSavable(doc))) {
    let res
    try {
      res = await saveInPlace(d as Doc & { path: string })
    } catch (err) {
      // Nobody is waiting on a background save to report its failure: this is
      // where the user hears of it, or they never do.
      logError(`auto-save ${d.name}`, err)
      res = { ok: false as const, reason: 'error' as const, message: String(err) }
    }
    if (res.ok) continue
    if (res.reason === 'conflict') {
      heldAt.set(d.id, d.mtimeMs)
      showNotice(
        `“${d.name}” was changed by another program, so it was not saved automatically. Save it to choose which version to keep.`,
        'error'
      )
    } else {
      showNotice(
        `“${d.name}” was not saved automatically. ${explainSaveError(res.code, res.message).summary}`,
        'error'
      )
    }
  }
}

/**
 * Saves every document auto-save may write, now. Resolves once they are
 * written; does nothing when auto-save is off.
 */
export async function autoSaveNow(): Promise<void> {
  window.clearTimeout(timer)
  timer = undefined
  if (!useSettingsStore().value.autoSave) return
  // One pass at a time: a second, started mid-write, would write the same
  // document again with an out-of-date file time and be refused as a conflict.
  while (running) await running
  flushAll()
  running = saveAll().finally(() => (running = null))
  await running
}

/** Starts saving automatically as documents change and the window loses focus. */
export function installAutoSave(): () => void {
  const docs = useDocuments()
  const stop = watch(
    () => docs.docs.map((d) => d.content),
    () => {
      if (!useSettingsStore().value.autoSave) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void autoSaveNow(), AUTOSAVE_AFTER_MS)
    }
  )
  const onBlur = (): void => void autoSaveNow()
  window.addEventListener('blur', onBlur)
  return () => {
    stop()
    window.clearTimeout(timer)
    window.removeEventListener('blur', onBlur)
  }
}
