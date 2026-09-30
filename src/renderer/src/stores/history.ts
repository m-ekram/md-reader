/**
 * The version history of the document in front (Help ▸ Data Recovery): the
 * versions kept before each save, one shown against the text now, and a way
 * to put it back.
 */
import { reactive } from 'vue'
import type { VersionInfo } from '../../../main/recovery'
import { activeDoc, journalKey, useDocuments } from './documents'
import { notify } from './notifications'
import { flushAll } from '../editor/pool'

export const historyState = reactive({
  open: false,
  docId: '',
  name: '',
  path: '',
  versions: [] as VersionInfo[],
  selected: '',
  /** The selected version's text; null until read. */
  content: null as string | null,
})

/** Opens the history of the document in front. */
export async function openHistory(): Promise<void> {
  const doc = activeDoc.value
  if (!doc?.path) return
  // Compared with what is on screen, not the store 200 ms ago.
  flushAll()
  Object.assign(historyState, {
    docId: doc.id,
    name: doc.name,
    path: doc.path,
    versions: await window.api.file.versions(doc.path),
    selected: '',
    content: null,
  })
  historyState.open = true
  if (historyState.versions[0]) await selectVersion(historyState.versions[0].id)
}

export async function selectVersion(id: string): Promise<void> {
  historyState.selected = id
  historyState.content = null
  const text = await window.api.file.versionContent(historyState.path, id)
  // Another may have been chosen while this one was read.
  if (historyState.selected === id) historyState.content = text
}

/** The text of the document now, to compare a version with. */
export function currentText(): string {
  return useDocuments().docs.find((d) => d.id === historyState.docId)?.content ?? ''
}

/**
 * Puts the selected version in the editor, as an edit: unsaved, so the file
 * on disk is untouched until it is saved, and the change can be undone by
 * reopening the history.
 */
export function restoreSelected(): void {
  const doc = useDocuments().docs.find((d) => d.id === historyState.docId)
  const content = historyState.content
  const version = historyState.versions.find((v) => v.id === historyState.selected)
  if (!doc || content === null || !version) return
  doc.content = content
  // The editor rebuilds from the store when shown: see Editor.vue.
  doc.reloadToken++
  window.api.file.journal(journalKey(doc), content)
  historyState.open = false
  notify(
    `Restored ${doc.name} as it was before the save at ${new Date(version.savedAtMs).toLocaleString()}. Save to keep it.`
  )
}
