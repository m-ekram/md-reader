/**
 * Replace across the open folder, from the Search panel: a preview of every
 * file it would change, each with a box to leave it out, then the replace.
 *
 * Files on disk are previewed and written by main (main/replace.ts). Open
 * documents are not: their text here may be newer than the disk, so they are
 * previewed from it and changed in their tabs, left unsaved, as any edit is.
 */
import { reactive } from 'vue'
import type { PreviewFile } from '../../../main/replace'
import {
  compileSearch,
  previewText,
  replaceAllIn,
  type ReplaceSpec,
} from '../../../shared/text-search'
import { journalKey, useDocuments } from './documents'
import { runSearch, useWorkspace } from './workspace'
import { notify } from './notifications'
import { describeError } from '../utils/report'
import { flushAll } from '../editor/pool'

export interface PreviewRow extends PreviewFile {
  /** An open document, changed in its tab rather than on disk. */
  docId: string | null
  chosen: boolean
}

export const replaceState = reactive({
  open: false,
  loading: false,
  spec: null as ReplaceSpec | null,
  rows: [] as PreviewRow[],
})

function inFolder(path: string, root: string): boolean {
  const p = path.toLowerCase()
  const r = root.toLowerCase().replace(/[\\/]+$/, '')
  return p.startsWith(`${r}\\`) || p.startsWith(`${r}/`)
}

/** Opens the preview for replacing what the folder search finds. */
export async function previewFolderReplace(replacement: string): Promise<void> {
  const ws = useWorkspace()
  const root = ws.root
  if (!root) return
  const spec: ReplaceSpec = {
    query: ws.search.query,
    caseSensitive: ws.search.caseSensitive,
    wholeWord: ws.search.wholeWord,
    regexp: ws.search.regexp,
    replacement,
  }
  const compiled = compileSearch(spec)
  if (!compiled.ok) {
    notify(compiled.error, { kind: 'error' })
    return
  }
  // What was typed last, not what the store had 200 ms ago.
  flushAll()
  const open = useDocuments().docs.filter((d) => d.path && inFolder(d.path, root))

  replaceState.spec = spec
  replaceState.rows = []
  replaceState.loading = true
  replaceState.open = true
  try {
    const onDisk = await window.api.search.previewReplace(
      spec,
      open.map((d) => d.path!)
    )
    const inTabs: PreviewRow[] = []
    for (const d of open) {
      const { count, samples } = previewText(d.content, compiled.re, spec)
      if (count === 0) continue
      inTabs.push({
        path: d.path!,
        relativePath: d.path!.slice(root.replace(/[\\/]+$/, '').length + 1).replace(/\\/g, '/'),
        mtimeMs: 0,
        count,
        samples,
        docId: d.id,
        chosen: true,
      })
    }
    replaceState.rows = [...inTabs, ...onDisk.map((f) => ({ ...f, docId: null, chosen: true }))]
  } catch (err) {
    replaceState.open = false
    notify(describeError(err), { kind: 'error' })
  } finally {
    replaceState.loading = false
  }
}

/** Replaces in the files left chosen, and says what was done and what was not. */
export async function applyFolderReplace(): Promise<void> {
  try {
    await applyChosen()
  } catch (err) {
    notify(describeError(err), { kind: 'error', key: 'replace' })
  }
}

async function applyChosen(): Promise<void> {
  // A plain copy: the reactive one cannot be sent to main.
  const spec = replaceState.spec ? { ...replaceState.spec } : null
  if (!spec) return
  const compiled = compileSearch(spec)
  if (!compiled.ok) return
  flushAll()
  const chosen = replaceState.rows.filter((r) => r.chosen)
  replaceState.open = false

  const result = await window.api.search.applyReplace(
    spec,
    chosen.filter((r) => !r.docId).map((r) => ({ path: r.path, mtimeMs: r.mtimeMs }))
  )
  let count = result.done.reduce((n, d) => n + d.count, 0)
  let files = result.done.length
  const docs = useDocuments()
  for (const row of chosen.filter((r) => r.docId)) {
    const doc = docs.docs.find((d) => d.id === row.docId)
    if (!doc) continue
    const replaced = replaceAllIn(doc.content, compiled.re, spec.replacement, spec.regexp === true)
    if (replaced.count === 0) continue
    doc.content = replaced.text
    // The editor rebuilds from the store when shown: see Editor.vue.
    doc.reloadToken++
    window.api.file.journal(journalKey(doc), doc.content)
    count += replaced.count
    files++
  }

  const skipped = result.skipped.map((s) => `${s.path.split(/[\\/]/).pop()} (${s.reason})`)
  notify(
    `Replaced ${count} ${count === 1 ? 'match' : 'matches'} in ${files} ${files === 1 ? 'file' : 'files'}.` +
      (skipped.length ? ` Not changed: ${skipped.join(', ')}.` : ''),
    { kind: skipped.length ? 'error' : 'info', key: 'replace' }
  )
  await runSearch(useWorkspace().search.query)
}
