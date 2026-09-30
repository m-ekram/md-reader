/**
 * Replace across the open folder: a preview first, then the files chosen.
 *
 * Matching and replacements come from shared/text-search.ts, as the folder
 * search and the page's preview of open documents do, so what is previewed is
 * what is written. Each file is written back in its own encoding, byte order
 * mark and line endings, after its bytes are kept as a backup (Data Recovery).
 * A file changed since the preview is skipped and named, not overwritten.
 *
 * Open documents are the page's: their text may be newer than the disk, so
 * the page changes them in their tabs and leaves them unsaved.
 */
import { readFile, stat } from 'node:fs/promises'
import {
  compileSearch,
  previewText,
  replaceAllIn,
  type ReplaceSample,
  type ReplaceSpec,
} from '../shared/text-search'
import { decodeTextBuffer, writeTextFile } from './fs/textfile'
import { allMarkdown } from './workspace'
import { resolveInside } from './paths'
import { backup } from './recovery'
import { log } from './log'

export type { ReplaceSpec }

export interface PreviewFile {
  path: string
  relativePath: string
  /** As it was at the preview; a file changed since is skipped. */
  mtimeMs: number
  count: number
  /** A few lines, as they are and as they would be. */
  samples: ReplaceSample[]
}

const MAX_FILE_BYTES = 1024 * 1024

function compile(spec: ReplaceSpec): RegExp {
  const c = compileSearch(spec)
  if (!c.ok) throw new Error(c.error)
  return c.re
}

/** The files that would change, leaving out those in `open`. */
export async function previewReplace(
  root: string,
  spec: ReplaceSpec,
  open: string[]
): Promise<PreviewFile[]> {
  const re = compile(spec)
  const skip = new Set(open.map((p) => p.toLowerCase()))
  const out: PreviewFile[] = []
  for (const file of await allMarkdown(root)) {
    if (skip.has(file.path.toLowerCase()) || file.size > MAX_FILE_BYTES) continue
    const text = decodeTextBuffer(await readFile(file.path)).content
    const { count, samples } = previewText(text, re, spec)
    if (count > 0) {
      out.push({
        path: file.path,
        relativePath: file.relativePath,
        mtimeMs: file.mtimeMs,
        count,
        samples,
      })
    }
  }
  return out
}

/** Replaces in the files chosen from the preview, one by one. */
export interface ReplaceResult {
  done: Array<{ path: string; count: number }>
  skipped: Array<{ path: string; reason: string }>
}

export async function applyReplace(
  root: string,
  spec: ReplaceSpec,
  files: Array<{ path: string; mtimeMs: number }>
): Promise<ReplaceResult> {
  const re = compile(spec)
  const done: Array<{ path: string; count: number }> = []
  const skipped: Array<{ path: string; reason: string }> = []
  for (const { path, mtimeMs } of files) {
    try {
      const target = await resolveInside(root, path)
      if ((await stat(target)).mtimeMs !== mtimeMs) {
        skipped.push({ path, reason: 'it changed since the preview' })
        continue
      }
      const bytes = await readFile(target)
      const file = decodeTextBuffer(bytes)
      const result = replaceAllIn(file.content, re, spec.replacement, spec.regexp === true)
      if (result.count === 0) continue
      backup(target, bytes)
      await writeTextFile(target, result.text, file)
      done.push({ path: target, count: result.count })
    } catch (err) {
      log.warn('replace skipped a file', { path, err: String(err) })
      skipped.push({ path, reason: String((err as Error).message ?? err) })
    }
  }
  log.info('replaced across the folder', { files: done.length, skipped: skipped.length })
  return { done, skipped }
}
