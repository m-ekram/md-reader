/**
 * Which file a `[[wiki link]]` names, among the open folder's markdown files.
 *
 * By file name without its extension, ignoring case, as wiki links are
 * written; or by a path, matched from its end (`trips/Porto`). When several
 * files match, the one in the same folder as the note the link is in wins,
 * then the shortest path, then the first in order, so it is the same one each
 * time.
 */
import { fuzzyScore } from './fuzzy'

const EXTENSION = /\.(md|markdown|mdown|mkd|mdx)$/i

type NoteFile = { path: string; relativePath: string }

const bare = (p: string): string => p.replace(/\\/g, '/').replace(EXTENSION, '').toLowerCase()
const dirOf = (p: string): string => bare(p).replace(/\/[^/]*$/, '')

/** Beside `fromPath` first, then the shorter path, then in order. */
function nearerFirst(fromPath: string | null): (a: NoteFile, b: NoteFile) => number {
  const fromDir = fromPath ? dirOf(fromPath) : null
  return (a, b) => {
    const near = Number(dirOf(b.path) === fromDir) - Number(dirOf(a.path) === fromDir)
    if (near !== 0) return near
    const depth = a.relativePath.length - b.relativePath.length
    if (depth !== 0) return depth
    return a.relativePath.localeCompare(b.relativePath)
  }
}

export function resolveWikiTarget(
  name: string,
  fromPath: string | null,
  files: ReadonlyArray<NoteFile>
): string | null {
  const wanted = bare(name.trim()).replace(/^\/+/, '')
  if (!wanted) return null
  const matches = files.filter((f) => {
    const rel = bare(f.relativePath)
    return rel === wanted || rel.endsWith(`/${wanted}`)
  })
  if (matches.length === 0) return null
  return [...matches].sort(nearerFirst(fromPath))[0].path
}

export interface WikiCandidate {
  path: string
  relativePath: string
  /** What goes between the brackets: the name, or a path where the name alone leads elsewhere. */
  insert: string
}

/** How many suggestions show at once. */
const MAX_CANDIDATES = 8

/**
 * The notes to suggest after `[[`, best fit first.
 *
 * Each one's `insert` is the shortest text that leads back to it through
 * resolveWikiTarget: its name, unless another note of that name is nearer,
 * and then its path within the folder.
 */
export function wikiCandidates(
  query: string,
  fromPath: string | null,
  files: ReadonlyArray<NoteFile>
): WikiCandidate[] {
  const q = query.trim().toLowerCase()
  const scored: Array<{ file: NoteFile; score: number }> = []
  for (const file of files) {
    const rel = file.relativePath.replace(/\\/g, '/').replace(EXTENSION, '')
    const name = rel.slice(rel.lastIndexOf('/') + 1)
    if (name.toLowerCase() === q) {
      scored.push({ file, score: Number.MAX_SAFE_INTEGER })
      continue
    }
    const best = Math.max(fuzzyScore(name, q) ?? -Infinity, fuzzyScore(rel, q) ?? -Infinity)
    if (best !== -Infinity) scored.push({ file, score: best })
  }
  const order = nearerFirst(fromPath)
  scored.sort((a, b) => b.score - a.score || order(a.file, b.file))

  return scored.slice(0, MAX_CANDIDATES).map(({ file }) => {
    const rel = file.relativePath.replace(/\\/g, '/').replace(EXTENSION, '')
    const name = rel.slice(rel.lastIndexOf('/') + 1)
    const insert = resolveWikiTarget(name, fromPath, files) === file.path ? name : rel
    return { path: file.path, relativePath: file.relativePath, insert }
  })
}
