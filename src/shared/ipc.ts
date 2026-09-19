/** Types shared across the preload bridge. */
import type { Encoding, Eol } from '../main/fs/textfile'

export interface DocumentFile {
  path: string
  content: string
  encoding: Encoding
  hasBom: boolean
  eol: Eol
  /** Modification time when read, used to detect external changes. */
  mtimeMs: number
}

export interface SaveRequest {
  path: string
  content: string
  encoding: Encoding
  hasBom: boolean
  eol: Eol
  /** Refuse the write if the file changed underneath us since this time. */
  expectedMtimeMs?: number
}

export type SaveResult =
  | { ok: true; mtimeMs: number }
  | { ok: false; reason: 'conflict' | 'error'; message: string }

export interface WindowState {
  maximized: boolean
  focused: boolean
}
