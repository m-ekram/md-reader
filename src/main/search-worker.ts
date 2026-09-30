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
import { compileSearch, findAll } from '../shared/text-search'
import { decodeTextBuffer, detectEncoding } from './fs/textfile'

export interface SearchRequest {
  root: string
  query: string
  caseSensitive: boolean
  regexp?: boolean
  wholeWord?: boolean
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
  opts: { caseSensitive?: boolean; regexp?: boolean; wholeWord?: boolean; limit?: number } = {}
): Array<{ line: number; column: number; preview: string; ordinal: number }> {
  // The same patterns as the find bar and replace across the folder. A
  // pattern that will not compile finds nothing: the page says why.
  const compiled = compileSearch({ query, ...opts })
  if (!compiled.ok) return []
  const limit = opts.limit ?? Infinity

  const out: Array<{ line: number; column: number; preview: string; ordinal: number }> = []
  let lineNo = 1
  let lineStart = 0
  let lastLine = 0
  const matches = findAll(text, compiled.re)
  for (let ordinal = 0; ordinal < matches.length && out.length < limit; ordinal++) {
    const { from } = matches[ordinal]
    // Move down to the line the match starts on.
    for (
      let nl = text.indexOf('\n', lineStart);
      nl >= 0 && nl < from;
      nl = text.indexOf('\n', lineStart)
    ) {
      lineStart = nl + 1
      lineNo++
    }
    // One hit per line, the first match on it, which is what the panel shows.
    if (lineNo === lastLine) continue
    lastLine = lineNo
    const end = text.indexOf('\n', lineStart)
    const line = text.slice(lineStart, end < 0 ? text.length : end).replace(/\r$/, '')
    out.push({
      line: lineNo,
      column: from - lineStart,
      preview: line.length > PREVIEW_LIMIT ? line.slice(0, PREVIEW_LIMIT) + '…' : line,
      ordinal,
    })
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
    // Decoded as opening decodes it. Read as UTF-8, a UTF-16 file was full of
    // NUL bytes, taken for binary and never searched.
    const { encoding } = detectEncoding(buf)
    if (encoding === 'utf8' && looksBinary(buf)) return
    const text = decodeTextBuffer(buf).content

    const matches = findMatches(text, req.query, {
      caseSensitive: req.caseSensitive,
      regexp: req.regexp,
      wholeWord: req.wholeWord,
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
