/**
 * Saying why a save failed, in words a user can act on.
 *
 * The raw error reads "EPERM: operation not permitted, rename 'C:\…\.tmp' ->
 * 'C:\…\notes.md'", which names a temporary file the user never saw and an
 * operation they never asked for. What they need to know is what is wrong with
 * *their* file, and whether their work is still safe (it is: the document stays
 * open and unsaved).
 *
 * Shared so the explanation can be tested without Electron, and so main, which
 * owns the dialog, and any later caller say the same thing.
 */

export interface SaveErrorExplanation {
  /** One line: what went wrong. */
  summary: string
  /** What the user can do about it. */
  advice: string
}

/**
 * Windows reports a file locked by another program as EBUSY or EPERM depending
 * on how it was opened, and a read-only attribute as EPERM too — so EPERM's
 * advice has to cover both rather than guessing which one it was.
 */
const BY_CODE: Record<string, SaveErrorExplanation> = {
  EPERM: {
    summary: 'The file could not be written.',
    advice:
      'It may be read-only, or another program — a sync client such as OneDrive, or antivirus — may have it open. Check the file’s properties, or wait a moment and save again.',
  },
  EACCES: {
    summary: 'You do not have permission to write to this file.',
    advice: 'Save it somewhere else with Save As, or change the file’s permissions.',
  },
  EBUSY: {
    summary: 'Another program has the file open.',
    advice: 'A sync client or antivirus scan can hold a file briefly. Wait a moment and save again.',
  },
  ENOSPC: {
    summary: 'The disk is full.',
    advice: 'Free some space, or save the document somewhere else with Save As.',
  },
  EROFS: {
    summary: 'The drive is read-only.',
    advice: 'Save the document somewhere else with Save As.',
  },
  ENOENT: {
    summary: 'The folder this file was in no longer exists.',
    advice: 'It may have been moved or deleted. Save the document somewhere else with Save As.',
  },
}

export function explainSaveError(code: string | undefined, message: string): SaveErrorExplanation {
  const known = code ? BY_CODE[code] : undefined
  if (known) return known
  // Unrecognised: pass the raw message through rather than inventing a reason.
  return {
    summary: 'The file could not be saved.',
    advice: message || 'An unknown error occurred.',
  }
}
