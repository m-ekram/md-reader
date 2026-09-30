/**
 * Which file a `[[wiki link]]` names, among the open folder's markdown files.
 *
 * By file name without its extension, ignoring case, as wiki links are
 * written; or by a path, matched from its end (`trips/Porto`). When several
 * files match, the one in the same folder as the note the link is in wins,
 * then the shortest path, then the first in order, so it is the same one each
 * time.
 */
const EXTENSION = /\.(md|markdown|mdown|mkd|mdx)$/i

const bare = (p: string): string => p.replace(/\\/g, '/').replace(EXTENSION, '').toLowerCase()

export function resolveWikiTarget(
  name: string,
  fromPath: string | null,
  files: ReadonlyArray<{ path: string; relativePath: string }>
): string | null {
  const wanted = bare(name.trim()).replace(/^\/+/, '')
  if (!wanted) return null
  const matches = files.filter((f) => {
    const rel = bare(f.relativePath)
    return rel === wanted || rel.endsWith(`/${wanted}`)
  })
  if (matches.length === 0) return null

  const fromDir = fromPath ? bare(fromPath).replace(/\/[^/]*$/, '') : null
  const dirOf = (p: string): string => bare(p).replace(/\/[^/]*$/, '')
  const ranked = [...matches].sort((a, b) => {
    const near = Number(dirOf(b.path) === fromDir) - Number(dirOf(a.path) === fromDir)
    if (near !== 0) return near
    const depth = a.relativePath.length - b.relativePath.length
    if (depth !== 0) return depth
    return a.relativePath.localeCompare(b.relativePath)
  })
  return ranked[0].path
}
