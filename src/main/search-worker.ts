/**
 * Folder-wide text search, in a worker thread.
 *
 * On the main thread a walk over a real notes folder would block every IPC
 * reply and freeze the UI for as long as it ran. Here it can also be abandoned
 * mid-walk when the user types another character, which is the common case.
 *
 * The matching logic is exported as plain functions so it can be tested without
 * spawning a worker; the bootstrap at the bottom is the only part that needs
 * one.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export interface SearchRequest {
  root: string
  query: string
  caseSensitive: boolean
  ignores: string[]
  maxFileBytes: number
  maxResults: number
}

export interface SearchHit {
  path: string
  relativePath: string
  line: number
  /** The matching line, trimmed for display. */
  preview: string
  column: number
  /** How many matches in the file come before this one, so a click can go to it. */
  ordinal: number
}

const MARKDOWN = ['.md', '.markdown', '.mdown', '.mkd', '.mdx']
const ALWAYS_SKIP = new Set(['.git', 'node_modules', '.svn', '.hg'])
const PREVIEW_LIMIT = 200

export function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN.some((e) => lower.endsWith(e))
}

/** Directory entries never worth walking into. */
export function shouldSkip(name: string, ignores: ReadonlySet<string>): boolean {
  return name.startsWith('.') || ALWAYS_SKIP.has(name) || ignores.has(name)
}

/**
 * A NUL byte in the first few KB means binary.
 *
 * Cheaper and more reliable than trusting the extension, and it stops a file
 * that happens to be named .md but holds binary data from producing garbage
 * previews.
 */
export function looksBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 4096)
  for (let i = 0; i < limit; i++) if (buf[i] === 0) return true
  return false
}

/**
 * Every match in one file's text.
 *
 * Reports one hit per matching line rather than per occurrence, which is what
 * the results panel shows.
 */
export function findMatches(
  text: string,
  query: string,
  opts: { caseSensitive?: boolean; limit?: number } = {}
): Array<{ line: number; column: number; preview: string; ordinal: number }> {
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  if (needle.length === 0) return []

  const limit = opts.limit ?? Infinity
  const hay = opts.caseSensitive ? text : text.toLowerCase()
  // Whole-file check first: most files in a notes folder do not match at all.
  if (!hay.includes(needle)) return []

  const lines = text.split(/\r?\n/)
  const out: Array<{ line: number; column: number; preview: string; ordinal: number }> = []
  /** Matches on the lines before this one. */
  let before = 0

  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const line = lines[i]
    const searched = opts.caseSensitive ? line : line.toLowerCase()
    const column = searched.indexOf(needle)
    if (column < 0) continue
    out.push({
      line: i + 1,
      column,
      preview: line.length > PREVIEW_LIMIT ? line.slice(0, PREVIEW_LIMIT) + '…' : line,
      ordinal: before,
    })
    // Every match on the line, not overlapping, as find counts them.
    for (let at = column; at >= 0; at = searched.indexOf(needle, at + needle.length)) before++
  }
  return out
}

// ---------------------------------------------------------------------------
// Worker bootstrap
// ---------------------------------------------------------------------------

if (parentPort && workerData) {
  const req = workerData as SearchRequest
  const ignores = new Set(req.ignores)
  let found = 0
  let cancelled = false

  parentPort.on('message', (m: { type: string }) => {
    if (m?.type === 'cancel') cancelled = true
  })

  const searchFile = async (path: string): Promise<void> => {
    let buf: Buffer
    try {
      const s = await stat(path)
      if (s.size > req.maxFileBytes) return
      buf = await readFile(path)
    } catch {
      return
    }
    if (looksBinary(buf)) return

    const matches = findMatches(buf.toString('utf8'), req.query, {
      caseSensitive: req.caseSensitive,
      limit: req.maxResults - found,
    })

    for (const m of matches) {
      if (cancelled) return
      found++
      const hit: SearchHit = {
        path,
        relativePath: relative(req.root, path).split(sep).join('/'),
        ...m,
      }
      // Streamed so the panel fills as results arrive rather than all at once.
      parentPort?.postMessage({ type: 'hit', hit })
    }
  }

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (cancelled || depth > 12 || found >= req.maxResults) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const e of entries) {
      if (cancelled || found >= req.maxResults) return
      if (shouldSkip(e.name, ignores)) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full, depth + 1)
      else if (isMarkdown(e.name)) await searchFile(full)
    }
  }

  void (async () => {
    if (req.query.length > 0) await walk(req.root, 0)
    parentPort?.postMessage({ type: 'done', cancelled, found })
  })()
}
