/**
 * The last session: which files were open, and which was in front.
 *
 * Kept in settings as the open files change, and reopened by the launch's
 * first window when "Reopen documents from last time" is on. Only saved files
 * are kept. An Untitled document has nothing on disk to reopen; if it held
 * work, recovery offers that back, as it always has. Help topics are not the
 * user's files and are left out.
 *
 * With several windows open, the session is the one that changed last.
 */
import { ref, watch } from 'vue'
import type { Settings } from '../../../shared/settings'
import { adoptFile, setActive, useDocuments, type Doc } from './documents'
import { patchSettings, useSettingsStore } from './settings'
import { showNotice } from './ui'

type Session = Pick<Settings['session'], 'files' | 'active'>

/** Written after the open files stop changing for this long. */
const WRITE_AFTER_MS = 500

/**
 * False until the window has opened what it starts with. The welcome screen
 * waits for it, so it does not flash up before the last session's files.
 */
export const started = ref(false)

/** What a window's documents amount to as a session. Pure, for testing. */
export function sessionOf(docs: readonly Doc[], activeIndex: number): Session {
  const kept = docs.filter((d) => d.path !== null && d.helpTopic === undefined)
  const active = docs[activeIndex]
  return {
    files: kept.map((d) => d.path!),
    active: active && kept.includes(active) ? active.path : null,
  }
}

let timer: number | undefined
let pending: Session | null = null

async function write(): Promise<void> {
  window.clearTimeout(timer)
  timer = undefined
  if (!pending) return
  const next = pending
  pending = null
  await patchSettings({ session: next })
}

/**
 * Keeps the session up to date from here on, starting with what the window
 * opened with: a file double-clicked in Explorer is the session too, though
 * nothing has changed since it opened. A window that starts empty records
 * nothing until it opens something, or a New Window would wipe the session
 * of the window beside it.
 */
export function trackSession(): void {
  const docs = useDocuments()
  watch(
    () => JSON.stringify(sessionOf(docs.docs, docs.activeIndex)),
    (json, before) => {
      const next = JSON.parse(json) as Session
      if (before === undefined) {
        const { files, active } = useSettingsStore().value.session
        if (next.files.length === 0 || json === JSON.stringify({ files, active })) return
      }
      pending = next
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void write(), WRITE_AFTER_MS)
    },
    { immediate: true }
  )
}

/** Writes a change still waiting on its pause, before the window closes. */
export function flushSession(): Promise<void> {
  return write()
}

/**
 * Reopens the last session's files, if that is switched on. Files that have
 * gone since are skipped, and the user is told how many.
 */
export async function restoreSession(): Promise<boolean> {
  const { restore, files, active } = useSettingsStore().value.session
  if (!restore || !Array.isArray(files) || files.length === 0) return false

  // Read first, then adopt together: adopting one at a time would make each
  // file the active one in turn and build an editor for every one of them.
  const read = await Promise.all(files.map((p) => window.api.file.read(p).catch(() => null)))
  const opened = read.filter((f) => f !== null)
  for (const f of opened) adoptFile(f)

  const docs = useDocuments()
  const front = docs.docs.findIndex((d) => d.path?.toLowerCase() === active?.toLowerCase())
  if (front >= 0) setActive(front)

  const missing = files.length - opened.length
  if (missing > 0) {
    showNotice(
      missing === 1
        ? 'A file open last time could not be found.'
        : `${missing} files open last time could not be found.`
    )
  }
  return opened.length > 0
}
