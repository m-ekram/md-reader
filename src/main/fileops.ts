/**
 * Files and folders made, renamed and deleted from the sidebar.
 *
 * Every path is checked against the open folder, and every name against what
 * Windows will store, before anything happens (see paths.ts). Nothing is ever
 * written over: a new file is made with the `wx` flag, so one that appeared in
 * the meantime is refused rather than emptied.
 *
 * A new file is created in place, not through `writeFileAtomic`: it is empty,
 * and the point of `wx` is that the create itself fails if the name is taken,
 * which a rename over the top would not.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { renameWithRetry } from './fs/textfile'
import { resolveInside, validName } from './paths'
import { isMarkdown } from './workspace'

function checkName(name: string): void {
  const problem = validName(name)
  if (problem) throw new Error(problem)
}

function alreadyThere(err: unknown, path: string): never {
  if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
    throw new Error(`${basename(path)} is already there.`)
  }
  throw err
}

/** Makes an empty markdown file in `dir`, adding .md; returns its path. */
export async function createFile(root: string, dir: string, name: string): Promise<string> {
  checkName(name)
  const fileName = isMarkdown(name) ? name : `${name}.md`
  const path = await resolveInside(root, join(dir, fileName))
  await writeFile(path, '', { flag: 'wx' }).catch((err) => alreadyThere(err, path))
  return path
}

/**
 * Renames a file or folder in place; returns its new path.
 *
 * A file keeps its extension when the new name has none. A name that is taken
 * is refused, except by the same file with its case changed, which Windows
 * sees as one name. On Windows a rename of a file something has open fails
 * outright, so it is retried for a moment (renameWithRetry).
 */
export async function renameEntry(root: string, path: string, name: string): Promise<string> {
  checkName(name)
  const from = await resolveInside(root, path)
  const isDir = (await stat(from)).isDirectory()
  const newName = !isDir && extname(name) === '' ? `${name}${extname(from)}` : name
  const to = await resolveInside(root, join(dirname(from), newName))
  if (to === from) return from
  const sameFile = process.platform === 'win32' && to.toLowerCase() === from.toLowerCase()
  if (!sameFile && (await exists(to))) throw new Error(`${newName} is already there.`)
  await renameWithRetry(from, to)
  return to
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/** Makes a folder in `dir`; returns its path. */
export async function createFolder(root: string, dir: string, name: string): Promise<string> {
  checkName(name)
  const path = await resolveInside(root, join(dir, name))
  await mkdir(path).catch((err) => alreadyThere(err, path))
  return path
}
