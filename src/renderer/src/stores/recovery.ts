/**
 * Offers back anything a crash left behind, once the window is usable.
 *
 * A journal key is either a real path or a synthetic `untitled:` id for a
 * buffer that was never saved, so the question describes both without showing
 * the synthetic key to the user.
 *
 * One question for everything found, whose Escape keeps the work for later:
 * it used to be one question per document, whose Escape deleted it.
 */
import type { JournalEntry } from '../../../main/recovery'
import { adoptFile, newDoc } from './documents'

/** What the user is shown for one piece of recovered work. */
export function recoveryLabel(entry: JournalEntry): string {
  if (!entry.path.startsWith('untitled:')) return entry.path
  const start = entry.content.trim().split('\n')[0].trim().slice(0, 40)
  return start ? `An unsaved document beginning “${start}”` : 'An unsaved document'
}

async function restore(entry: JournalEntry): Promise<void> {
  const untitled = entry.path.startsWith('untitled:')
  const file = untitled ? null : await window.api.file.read(entry.path).catch(() => null)
  // The file may be open already, reopened with the last session: adoptFile
  // then returns that tab, whose editor was built from the text on disk. The
  // reload token has it rebuilt from the recovered text instead.
  const doc = file ? adoptFile(file) : newDoc()
  doc.content = entry.content
  doc.reloadToken++
}

export async function offerRecoveries(): Promise<void> {
  const pending = await window.api.file.pendingRecoveries()
  if (pending.length === 0) return

  // Asked after the window is usable, never as a gate in front of it: a modal
  // before the first document exists leaves the app looking hung if anything
  // goes wrong answering it.
  const choice = await window.api.file.recoveryPrompt(pending.map(recoveryLabel))
  if (choice === 'later') return
  if (choice === 'restore') {
    for (const entry of pending) await restore(entry)
    return
  }
  if (choice === 'discard') {
    // Only ever for a single document, and only after a second question.
    await window.api.file.discardRecovery(pending[0].path)
    return
  }

  // Review: the same question, one document at a time.
  for (const entry of pending) {
    const one = await window.api.file.recoveryPrompt([recoveryLabel(entry)])
    if (one === 'restore') await restore(entry)
    else if (one === 'discard') await window.api.file.discardRecovery(entry.path)
  }
}
