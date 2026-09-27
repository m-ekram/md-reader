import { existsSync } from 'node:fs'

/** The file types the app opens from the command line and from Explorer. */
export const OPENABLE = /\.(md|markdown|mdown|mkd|txt)$/i

/**
 * Markdown paths passed on the command line, e.g. by "Open with" or a
 * double-click in Explorer. Flags and the executable are skipped, and so is a
 * path that no longer exists.
 */
export function markdownArgs(
  argv: string[],
  exists: (p: string) => boolean = existsSync
): string[] {
  return argv.slice(1).filter((a) => !a.startsWith('-') && OPENABLE.test(a) && exists(a))
}
