/**
 * Brief messages, shown above the status bar at the bottom right.
 *
 * The status bar had one slot for them, shared with the lasting warnings (a
 * deleted file, a lossy one): a message hid the warning while it showed, and a
 * second message replaced the first before it could be read. Messages now stack,
 * up to three, may carry actions ("Open", "Show in Folder"), and stay while the
 * pointer rests on them. The status bar keeps the lasting warnings.
 */
import { reactive } from 'vue'

export interface NoteAction {
  label: string
  run: () => unknown
}

export interface Note {
  id: number
  text: string
  kind: 'info' | 'error'
  actions: NoteAction[]
  key?: string
}

export interface NotifyOptions {
  kind?: 'info' | 'error'
  actions?: NoteAction[]
  /** How long it shows, in ms; 0 keeps it until dismissed or replaced. */
  timeoutMs?: number
  /** A later message with the same key replaces this one where it stands. */
  key?: string
}

/** More than this and the oldest goes. */
const MAX = 3
const INFO_MS = 4500
/** Errors, and messages with actions: long enough to read and to reach. */
const LONG_MS = 9000

export const notes = reactive<Note[]>([])

interface Timer {
  handle: number | undefined
  remaining: number
  startedAt: number
}
const timers = new Map<number, Timer>()
let nextId = 1

export function notify(text: string, opts: NotifyOptions = {}): number {
  const kind = opts.kind ?? 'info'
  const actions = opts.actions ?? []
  const timeout = opts.timeoutMs ?? (kind === 'error' || actions.length > 0 ? LONG_MS : INFO_MS)

  const same = opts.key === undefined ? undefined : notes.find((n) => n.key === opts.key)
  let id: number
  if (same) {
    id = same.id
    Object.assign(same, { text, kind, actions })
  } else {
    id = nextId++
    notes.push({ id, text, kind, actions, key: opts.key })
    while (notes.length > MAX) dismiss(notes[0].id)
  }

  stop(id)
  if (timeout > 0) {
    timers.set(id, { handle: undefined, remaining: timeout, startedAt: 0 })
    resume(id)
  }
  return id
}

export function dismiss(id: number): void {
  stop(id)
  const i = notes.findIndex((n) => n.id === id)
  if (i >= 0) notes.splice(i, 1)
}

/** Holds a message while the pointer or focus is on it. */
export function pause(id: number): void {
  const t = timers.get(id)
  if (!t || t.handle === undefined) return
  window.clearTimeout(t.handle)
  t.handle = undefined
  t.remaining -= Date.now() - t.startedAt
}

/** Lets a held message go on, for the time it had left. */
export function resume(id: number): void {
  const t = timers.get(id)
  if (!t || t.handle !== undefined) return
  t.startedAt = Date.now()
  t.handle = window.setTimeout(() => dismiss(id), Math.max(0, t.remaining))
}

/** Runs one of a message's actions; the message has done its job. */
export async function runAction(id: number, index: number): Promise<void> {
  const action = notes.find((n) => n.id === id)?.actions[index]
  dismiss(id)
  await action?.run()
}

function stop(id: number): void {
  const t = timers.get(id)
  if (t?.handle !== undefined) window.clearTimeout(t.handle)
  timers.delete(id)
}
