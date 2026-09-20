/**
 * Folder-wide text search, in a worker thread.
 *
 * On the main thread a walk over a real notes folder would block every IPC
 * reply and freeze the UI for as long as it ran. Here it can also be abandoned
 * mid-walk when the user types another character, which is the common case.
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
}

const MARKDOWN = ['.md', '.markdown', '.mdown', '.mkd', '.mdx']
const ALWAYS_SKIP = new Set(['.git', 'node_modules', '.svn', '.hg'])

const req = workerData as SearchRequest
const ignores = new Set(req.ignores)
const needle = req.caseSensitive ? req.query : req.query.toLowerCase()

let found = 0
let cancelled = false

parentPort?.on('message', (m: { type: string }) => {
  if (m?.type === 'cancel') cancelled = true
})

function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN.some((e) => lower.endsWith(e))
}

/**
 * A NUL byte in the first few KB means binary. Cheaper and more reliable than
 * trusting the extension, and it keeps a stray .md that is really a binary from
 * producing garbage previews.
 */
function looksBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 4096)
  for (let i = 0; i < limit; i++) if (buf[i] === 0) return true
  return false
}

async function searchFile(path: string): Promise<void> {
  let buf: Buffer
  try {
    const s = await stat(path)
    if (s.size > req.maxFileBytes) return
    buf = await readFile(path)
  } catch {
    return
  }
  if (looksBinary(buf)) return

  const text = buf.toString('utf8')
  const hay = req.caseSensitive ? text : text.toLowerCase()
  if (!hay.includes(needle)) return // whole-file check first: most files miss

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (cancelled || found >= req.maxResults) return
    const line = lines[i]
    const col = (req.caseSensitive ? line : line.toLowerCase()).indexOf(needle)
    if (col < 0) continue

    found++
    const hit: SearchHit = {
      path,
      relativePath: relative(req.root, path).split(sep).join('/'),
      line: i + 1,
      column: col,
      preview: line.length > 200 ? line.slice(0, 200) + '…' : line,
    }
    // Streamed so the panel fills as results arrive rather than all at once.
    parentPort?.postMessage({ type: 'hit', hit })
  }
}

async function walk(dir: string, depth: number): Promise<void> {
  if (cancelled || depth > 12 || found >= req.maxResults) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const e of entries) {
    if (cancelled || found >= req.maxResults) return
    if (e.name.startsWith('.') || ALWAYS_SKIP.has(e.name) || ignores.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, depth + 1)
    else if (isMarkdown(e.name)) await searchFile(full)
  }
}

void (async () => {
  if (needle.length > 0) await walk(req.root, 0)
  parentPort?.postMessage({ type: 'done', cancelled, found })
})()
