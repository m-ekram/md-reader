/**
 * Paths the page asks main to act on, checked before anything touches them.
 *
 * The sidebar makes, renames and deletes files. The page is sandboxed, but a
 * path it sends is only a string: one that climbed out with "..", named
 * another drive, or went through a link to a folder elsewhere would have main
 * write or delete outside the folder the user opened. Everything the sidebar
 * does goes through here, and so does reading the folder.
 */
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

const ignoreCase = process.platform === 'win32'

/** The real path, through links and junctions; for a path not made yet, its folder's. */
async function real(p: string): Promise<string> {
  try {
    return await realpath(p)
  } catch {
    const parent = dirname(p)
    if (parent === p) return p
    return join(await real(parent), basename(p))
  }
}

/**
 * `path`, resolved, if it lies inside `root`; otherwise an error. The folder
 * itself only with `allowRoot`: reading it is fine, deleting it is not.
 */
export async function resolveInside(
  root: string,
  path: string,
  opts: { allowRoot?: boolean } = {}
): Promise<string> {
  if (typeof path !== 'string' || path.length === 0) throw new Error('No path was given.')
  const full = resolve(path)
  const [realRoot, realFull] = await Promise.all([real(resolve(root)), real(full)])
  const fold = (s: string): string => (ignoreCase ? s.toLowerCase() : s)
  const rel = relative(fold(realRoot), fold(realFull))
  if (rel === '') {
    if (opts.allowRoot) return full
    throw new Error('That is the open folder itself.')
  }
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`${full} is not inside the open folder.`)
  }
  return full
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/

/** Why a file or folder name cannot be used on Windows, or null when it can. */
export function validName(name: string): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) return 'A name is needed.'
  if (name === '.' || name === '..') return 'That name is taken by the folder itself.'
  if (FORBIDDEN.test(name)) return 'A name cannot contain < > : " / \\ | ? or *.'
  if (/[. ]$/.test(name)) return 'A name cannot end with a dot or a space.'
  if (RESERVED.test(name)) return `Windows keeps the name ${name.split('.')[0]} for itself.`
  if (name.length > 255) return 'That name is too long.'
  return null
}
