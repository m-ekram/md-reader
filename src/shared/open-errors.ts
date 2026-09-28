/**
 * Saying why a file could not be opened, in words a user can act on.
 *
 * The raw error is "Error invoking remote method 'file:read': Error: ENOENT:
 * no such file or directory, open 'C:\…'". What the user needs is what is
 * wrong with *their* file. The companion of `save-errors.ts`.
 */

const BY_CODE: Record<string, string> = {
  ENOENT: 'it is no longer there. It may have been moved, renamed or deleted.',
  EACCES: 'you do not have permission to read it.',
  EPERM: 'it could not be read. Another program may have it locked.',
  EBUSY: 'another program has it open.',
  EISDIR: 'it is a folder, not a file.',
}

/** The file's name, from a Windows or POSIX path. */
function nameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

/** One sentence: which file, and why it did not open. */
export function explainOpenError(path: string, err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  const code = text.match(/\b(E[A-Z]{3,})\b/)?.[1]
  const why = (code && BY_CODE[code]) ?? 'it could not be read.'
  return `Could not open “${nameOf(path)}”: ${why}`
}
