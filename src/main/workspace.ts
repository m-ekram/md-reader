/**
 * The opened folder: lazy directory listings for the tree, and a flat list of
 * every markdown file for Articles and Open Quickly.
 *
 * Scanning happens in main because the renderer is sandboxed and has no
 * filesystem access at all.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { log } from './log'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx']

/** Never worth walking, and walking them is how a scan turns into a hang. */
const ALWAYS_SKIP = new Set(['.git', 'node_modules', '.svn', '.hg', '$RECYCLE.BIN', 'System Volume Information'])

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  /** Only meaningful for files. */
  isMarkdown: boolean
}

export interface MarkdownFile {
  path: string
  name: string
  /** Path relative to the workspace root, for display and fuzzy matching. */
  relativePath: string
  mtimeMs: number
  size: number
}

export function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((e) => lower.endsWith(e))
}

function skip(name: string): boolean {
  return ALWAYS_SKIP.has(name) || name.startsWith('.')
}

/**
 * Minimal .gitignore support: literal names and simple directory patterns.
 *
 * Deliberately not a full gitignore implementation. The goal is to avoid
 * walking build output in a notes folder that happens to be a repository, not
 * to reproduce git's matching rules.
 */
export async function loadIgnores(root: string): Promise<Set<string>> {
  const out = new Set<string>()
  const file = join(root, '.gitignore')
  if (!existsSync(file)) return out
  try {
    for (const raw of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || line.startsWith('!')) continue
      if (line.includes('*') || line.includes('?')) continue
      out.add(line.replace(/^\/+/, '').replace(/\/+$/, ''))
    }
  } catch (err) {
    log.warn('gitignore read failed', { root, err: String(err) })
  }
  return out
}

/** One level only; the tree asks for children when a folder is expanded. */
export async function readDirectory(dir: string, ignores?: Set<string>): Promise<DirEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: DirEntry[] = []

  for (const e of entries) {
    if (skip(e.name) || ignores?.has(e.name)) continue
    const isDirectory = e.isDirectory()
    if (!isDirectory && !isMarkdown(e.name)) continue
    out.push({
      name: e.name,
      path: join(dir, e.name),
      isDirectory,
      isMarkdown: !isDirectory,
    })
  }

  // Folders first, then files, each alphabetically and case-insensitively.
  return out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/**
 * Every markdown file under the root, flat.
 *
 * Bounded by depth and count so a folder opened by mistake — a drive root, say
 * — cannot walk forever.
 */
export async function allMarkdown(
  root: string,
  opts: { maxDepth?: number; maxFiles?: number } = {}
): Promise<MarkdownFile[]> {
  const maxDepth = opts.maxDepth ?? 12
  const maxFiles = opts.maxFiles ?? 20_000
  const ignores = await loadIgnores(root)
  const out: MarkdownFile[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || out.length >= maxFiles) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable directory: skip rather than abort the whole scan
    }

    for (const e of entries) {
      if (out.length >= maxFiles) return
      if (skip(e.name) || ignores.has(e.name)) continue
      const full = join(dir, e.name)

      if (e.isDirectory()) {
        await walk(full, depth + 1)
      } else if (isMarkdown(e.name)) {
        try {
          const s = await stat(full)
          out.push({
            path: full,
            name: e.name,
            relativePath: relative(root, full).split(sep).join('/'),
            mtimeMs: s.mtimeMs,
            size: s.size,
          })
        } catch {
          // Vanished between readdir and stat; ignore.
        }
      }
    }
  }

  await walk(root, 0)
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }))
  if (out.length >= maxFiles) log.warn('markdown scan hit its cap', { root, maxFiles })
  return out
}
