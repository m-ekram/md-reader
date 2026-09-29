/**
 * The files this session exported, which the page may ask main to open.
 *
 * Opening a path hands it to Windows to run with whatever program it is
 * associated with. A page asking to open any path it names would be a way to
 * launch anything on the disk, so the request is honoured only for a file main
 * itself wrote as an export, and only for the types an export writes.
 */
import { extname, resolve } from 'node:path'

const OPENABLE = new Set(['.html', '.htm', '.pdf'])
const written = new Set<string>()

function key(path: string): string {
  const full = resolve(path)
  return process.platform === 'win32' ? full.toLowerCase() : full
}

export function rememberExport(path: string): void {
  written.add(key(path))
}

export function mayOpenExport(path: string): boolean {
  return (
    typeof path === 'string' && OPENABLE.has(extname(path).toLowerCase()) && written.has(key(path))
  )
}
