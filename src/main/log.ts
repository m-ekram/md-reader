/**
 * File logger. An editor that loses work must leave evidence of why, and a
 * packaged app has no console to watch, so diagnostics go to a file under
 * userData alongside the settings and recovery journal.
 */
import { app } from 'electron'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

type Level = 'info' | 'warn' | 'error'

let stream: WriteStream | null = null

function open(): WriteStream {
  if (stream) return stream
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  stream = createWriteStream(join(dir, 'main.log'), { flags: 'a' })
  return stream
}

function write(level: Level, msg: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}${
    extra === undefined ? '' : ' ' + safeJson(extra)
  }\n`
  try {
    open().write(line)
  } catch {
    // Logging must never be the reason the app fails.
  }
  if (!app.isPackaged) process.stdout.write(line)
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export const log = {
  info: (msg: string, extra?: unknown) => write('info', msg, extra),
  warn: (msg: string, extra?: unknown) => write('warn', msg, extra),
  error: (msg: string, extra?: unknown) => write('error', msg, extra),
}

/** Captures the failures that would otherwise vanish silently. */
export function installCrashHandlers(): void {
  process.on('uncaughtException', (err) =>
    log.error('uncaughtException', { message: err.message, stack: err.stack })
  )
  process.on('unhandledRejection', (reason) =>
    log.error('unhandledRejection', { reason: String(reason) })
  )
}
