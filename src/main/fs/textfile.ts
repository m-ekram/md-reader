/**
 * Reading and writing markdown files without changing anything we were not asked
 * to change.
 *
 * A file has three properties beyond its text that a careless editor silently
 * rewrites: its encoding, whether it carries a byte-order mark, and whether its
 * lines end in LF or CRLF. Round-tripping those is the difference between a save
 * producing a one-line diff and a save producing a whole-file diff.
 */
import { readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'

export type Encoding = 'utf8' | 'utf16le' | 'utf16be'
export type Eol = '\n' | '\r\n'

export interface TextFile {
  /** Content normalized to LF, with any BOM stripped. */
  content: string
  encoding: Encoding
  hasBom: boolean
  /** The dominant line ending in the original file. */
  eol: Eol
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16BE_BOM = Buffer.from([0xfe, 0xff])

export function detectEncoding(buf: Buffer): { encoding: Encoding; hasBom: boolean } {
  if (buf.subarray(0, 3).equals(UTF8_BOM)) return { encoding: 'utf8', hasBom: true }
  if (buf.subarray(0, 2).equals(UTF16LE_BOM)) return { encoding: 'utf16le', hasBom: true }
  if (buf.subarray(0, 2).equals(UTF16BE_BOM)) return { encoding: 'utf16be', hasBom: true }
  return { encoding: 'utf8', hasBom: false }
}

/**
 * Picks the dominant line ending. Mixed files are common (a CRLF file edited on
 * Linux, say); we follow the majority so a save does not flip every other line.
 */
export function detectEol(content: string): Eol {
  const crlf = (content.match(/\r\n/g) ?? []).length
  const lf = (content.match(/(?<!\r)\n/g) ?? []).length
  if (crlf === 0 && lf === 0) return process.platform === 'win32' ? '\r\n' : '\n'
  return crlf >= lf ? '\r\n' : '\n'
}

function decode(buf: Buffer, encoding: Encoding, hasBom: boolean): string {
  if (encoding === 'utf16be') {
    // Node has no utf16be decoder; swap byte pairs into utf16le.
    const body = hasBom ? buf.subarray(2) : buf
    const swapped = Buffer.from(body)
    swapped.swap16()
    return swapped.toString('utf16le')
  }
  if (encoding === 'utf16le') {
    return buf.subarray(hasBom ? 2 : 0).toString('utf16le')
  }
  return buf.subarray(hasBom ? 3 : 0).toString('utf8')
}

function encode(content: string, encoding: Encoding, hasBom: boolean): Buffer {
  if (encoding === 'utf16be') {
    const body = Buffer.from(content, 'utf16le')
    body.swap16()
    return hasBom ? Buffer.concat([UTF16BE_BOM, body]) : body
  }
  if (encoding === 'utf16le') {
    const body = Buffer.from(content, 'utf16le')
    return hasBom ? Buffer.concat([UTF16LE_BOM, body]) : body
  }
  const body = Buffer.from(content, 'utf8')
  return hasBom ? Buffer.concat([UTF8_BOM, body]) : body
}

/** Decodes raw bytes the way a file read would, for callers holding a Buffer. */
export function decodeTextBuffer(buf: Buffer): TextFile {
  return fromBuffer(buf)
}

function fromBuffer(buf: Buffer): TextFile {
  const { encoding, hasBom } = detectEncoding(buf)
  const raw = decode(buf, encoding, hasBom)
  return {
    content: raw.replace(/\r\n/g, '\n'),
    encoding,
    hasBom,
    eol: detectEol(raw),
  }
}

export async function readTextFile(path: string): Promise<TextFile> {
  return fromBuffer(await readFile(path))
}

/** Same decoding, for the callers that cannot await (the recovery scan). */
export function readTextFileSync(path: string): TextFile {
  return fromBuffer(readFileSync(path))
}

/**
 * Writes atomically: a temp file in the same directory, then a rename. A crash
 * mid-write leaves the original intact rather than a half-written file, and the
 * same-directory temp keeps the rename on one volume so it stays atomic.
 */
export async function writeTextFile(
  path: string,
  content: string,
  format: Pick<TextFile, 'encoding' | 'hasBom' | 'eol'>
): Promise<void> {
  const withEol = format.eol === '\r\n' ? content.replace(/\r?\n/g, '\r\n') : content.replace(/\r\n/g, '\n')
  const buf = encode(withEol, format.encoding, format.hasBom)
  const tmp = join(dirname(path), `.${randomBytes(6).toString('hex')}.tmp`)

  try {
    await writeFile(tmp, buf)
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}
