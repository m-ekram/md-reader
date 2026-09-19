/**
 * The command registry: one table that the menu bar, the keyboard layer, the
 * context menus and (later) the command palette all read from.
 *
 * A command that is not registered is not an error — the menu simply renders its
 * item disabled. That is deliberate: it lets the full menu ship in Phase 1 while
 * later phases light up their own items by registering handlers, with no stub
 * handlers and no second list to keep in sync.
 */
import { reactive, shallowReactive } from 'vue'

export interface Command {
  id: string
  /** Overrides the menu's label where a command wants its own wording. */
  label?: string
  /** False greys the item out. Read during render, so keep it cheap. */
  enabled?: () => boolean
  /** Present for checkable items; drives the checkmark and aria-checked. */
  checked?: () => boolean
  run: () => void | Promise<void>
}

const commands = shallowReactive(new Map<string, Command>())

/** Bumped whenever state that `enabled`/`checked` depend on changes. */
export const commandEpoch = reactive({ value: 0 })

export function invalidateCommands(): void {
  commandEpoch.value++
}

export function register(cmd: Command): void {
  commands.set(cmd.id, cmd)
}

export function registerAll(cmds: Command[]): void {
  for (const c of cmds) commands.set(c.id, c)
}

export function getCommand(id: string): Command | undefined {
  return commands.get(id)
}

export function isRegistered(id: string): boolean {
  return commands.has(id)
}

export function isEnabled(id: string): boolean {
  const c = commands.get(id)
  if (!c) return false
  return c.enabled ? c.enabled() : true
}

export function isChecked(id: string): boolean | undefined {
  const c = commands.get(id)
  if (!c?.checked) return undefined
  return c.checked()
}

export async function run(id: string): Promise<void> {
  const c = commands.get(id)
  if (!c || (c.enabled && !c.enabled())) return
  await c.run()
  invalidateCommands()
}

export function registeredIds(): string[] {
  return [...commands.keys()]
}

// ---------------------------------------------------------------------------
// Accelerators
// ---------------------------------------------------------------------------

/**
 * Normalizes an accelerator string into a comparable form.
 * "Ctrl+Shift+=" -> "ctrl+shift+="
 */
function normalizeAccel(accel: string): string {
  const parts = accel.split('+').map((p) => p.trim().toLowerCase())
  const mods = new Set(parts.slice(0, -1))
  const key = parts[parts.length - 1]
  const order = ['ctrl', 'alt', 'shift', 'meta'].filter((m) => mods.has(m))
  return [...order, key].join('+')
}

/** Normalizes a keyboard event the same way, so the two can be compared. */
export function accelFromEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  if (e.metaKey) parts.push('meta')

  let key = e.key.toLowerCase()
  // Use the physical key for digits and punctuation so Shift combinations such
  // as Ctrl+Shift+= do not arrive as "+" and fail to match.
  if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (e.code === 'Equal') key = '='
  else if (e.code === 'Minus') key = '-'
  else if (e.code === 'BracketLeft') key = '['
  else if (e.code === 'BracketRight') key = ']'
  else if (e.code === 'Backquote') key = '`'
  else if (e.code === 'Backslash') key = '\\'
  else if (e.code === 'Comma') key = ','
  else if (e.code === 'Slash') key = '/'
  else if (key === 'arrowup') key = 'up'
  else if (key === 'arrowdown') key = 'down'
  else if (key === 'arrowleft') key = 'left'
  else if (key === 'arrowright') key = 'right'
  else if (key === ' ') key = 'space'

  parts.push(key)
  return parts.join('+')
}

const accelToCommand = new Map<string, string>()

export function bindAccelerators(pairs: Array<{ id: string; accel?: string }>): void {
  accelToCommand.clear()
  for (const { id, accel } of pairs) {
    if (accel) accelToCommand.set(normalizeAccel(accel), id)
  }
}

export function commandForAccel(e: KeyboardEvent): string | undefined {
  return accelToCommand.get(accelFromEvent(e))
}
