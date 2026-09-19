// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { MENUS, type MenuNode } from './menus'
import { EDITOR_DELEGATED } from './registry'

/**
 * The assertion that would have caught the worst bug in Phase 1.
 *
 * The menu declares accelerators for commands that later phases will implement.
 * If the app-level key handler claims one of those keys before its command
 * exists, the keystroke is swallowed and nothing happens. That is how Ctrl+C,
 * Ctrl+V, Ctrl+Z and Tab were all dead while every test passed.
 *
 * Two rules keep it from recurring:
 *   1. Keys the editor owns are never bound as app accelerators.
 *   2. The key handler ignores accelerators whose command is unregistered.
 */

function accelItems(nodes: MenuNode[]): Array<{ id: string; accel: string }> {
  const out: Array<{ id: string; accel: string }> = []
  for (const n of nodes) {
    if (n.kind === 'item' && n.accel) out.push({ id: n.id, accel: n.accel })
    else if (n.kind === 'submenu') out.push(...accelItems(n.items))
  }
  return out
}

const items = accelItems(MENUS.flatMap((m) => m.items))

describe('editor-owned keys', () => {
  // These are the keys a user presses constantly. If the app ever claims one,
  // that feature dies silently in the editor.
  const mustBeDelegated = [
    ['edit.copy', 'Ctrl+C'],
    ['edit.cut', 'Ctrl+X'],
    ['edit.paste', 'Ctrl+V'],
    ['edit.undo', 'Ctrl+Z'],
    ['edit.redo', 'Ctrl+Y'],
    ['edit.selectAll', 'Ctrl+A'],
    ['para.indent', 'Tab'],
    ['para.outdent', 'Shift+Tab'],
  ] as const

  for (const [id, accel] of mustBeDelegated) {
    it(`${accel} (${id}) is left to the editor`, () => {
      expect(EDITOR_DELEGATED.has(id), `${id} must be editor-delegated`).toBe(true)
    })
  }

  it('every delegated id is a real menu command', () => {
    const ids = new Set(accelItems(MENUS.flatMap((m) => m.items)).map((i) => i.id))
    for (const id of EDITOR_DELEGATED) {
      expect(ids.has(id), `${id} is delegated but not in the menu`).toBe(true)
    }
  })
})

describe('accelerator binding', () => {
  it('binds no editor-owned key', async () => {
    const { bindAccelerators, commandForAccel } = await import('./registry')
    bindAccelerators(items)

    const ev = (init: Partial<KeyboardEvent> & { key: string; code: string }) =>
      ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent

    expect(commandForAccel(ev({ key: 'c', code: 'KeyC', ctrlKey: true }))).toBeUndefined()
    expect(commandForAccel(ev({ key: 'v', code: 'KeyV', ctrlKey: true }))).toBeUndefined()
    expect(commandForAccel(ev({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBeUndefined()
    expect(commandForAccel(ev({ key: 'Tab', code: 'Tab' }))).toBeUndefined()
  })

  it('still binds genuine application shortcuts', async () => {
    const { bindAccelerators, commandForAccel } = await import('./registry')
    bindAccelerators(items)

    const ev = (init: Partial<KeyboardEvent> & { key: string; code: string }) =>
      ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent

    expect(commandForAccel(ev({ key: 's', code: 'KeyS', ctrlKey: true }))).toBe('file.save')
    expect(commandForAccel(ev({ key: 'o', code: 'KeyO', ctrlKey: true }))).toBe('file.open')
    expect(commandForAccel(ev({ key: 'n', code: 'KeyN', ctrlKey: true }))).toBe('file.new')
  })
})
