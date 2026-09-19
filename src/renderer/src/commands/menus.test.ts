// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { MENUS, allMenuCommandIds, type MenuNode } from './menus'

/**
 * The menu specification contract.
 *
 * With ~140 items across seven menus, a manual checklist will not survive six
 * phases of development. These assertions pin the structure and the
 * accelerators so that an accidental edit fails loudly.
 */

function walk(nodes: MenuNode[], fn: (n: MenuNode) => void): void {
  for (const n of nodes) {
    fn(n)
    if (n.kind === 'submenu') walk(n.items, fn)
  }
}

const allNodes: MenuNode[] = []
walk(
  MENUS.flatMap((m) => m.items),
  (n) => allNodes.push(n)
)

describe('menu structure', () => {
  it('has exactly the seven top-level menus, in order', () => {
    expect(MENUS.map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'Paragraph',
      'Format',
      'View',
      'Themes',
      'Help',
    ])
  })

  it('gives every command id a unique entry', () => {
    const ids = allMenuCommandIds()
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('never renders two separators in a row or a trailing separator', () => {
    const check = (items: MenuNode[], path: string) => {
      items.forEach((n, i) => {
        if (n.kind === 'separator') {
          expect(items[i - 1]?.kind, `${path}: separator at ${i}`).not.toBe('separator')
          expect(i, `${path}: trailing separator`).toBeLessThan(items.length - 1)
          expect(i, `${path}: leading separator`).toBeGreaterThan(0)
        }
        if (n.kind === 'submenu') check(n.items, `${path} > ${n.label}`)
      })
    }
    for (const m of MENUS) check(m.items, m.label)
  })

  it('gives every item and submenu a non-empty label', () => {
    walk(
      MENUS.flatMap((m) => m.items),
      (n) => {
        if (n.kind === 'item' || n.kind === 'submenu' || n.kind === 'dynamic') {
          expect(n.label.length).toBeGreaterThan(0)
        }
      }
    )
  })

  it('never assigns the same accelerator to two commands', () => {
    const seen = new Map<string, string>()
    walk(
      MENUS.flatMap((m) => m.items),
      (n) => {
        if (n.kind !== 'item' || !n.accel) return
        const prior = seen.get(n.accel)
        expect(prior, `${n.accel} used by both ${prior} and ${n.id}`).toBeUndefined()
        seen.set(n.accel, n.id)
      }
    )
  })
})

describe('specified accelerators', () => {
  const accelOf = (id: string): string | undefined => {
    let found: string | undefined
    walk(
      MENUS.flatMap((m) => m.items),
      (n) => {
        if (n.kind === 'item' && n.id === id) found = n.accel
      }
    )
    return found
  }

  // Spot-checks against the specification, covering each menu and the
  // easy-to-mistype ones.
  const expected: Array<[string, string]> = [
    ['file.new', 'Ctrl+N'],
    ['file.newWindow', 'Ctrl+Shift+N'],
    ['file.openQuickly', 'Ctrl+P'],
    ['file.saveAs', 'Ctrl+Shift+S'],
    ['file.print', 'Alt+Shift+P'],
    ['file.preferences', 'Ctrl+,'],
    ['edit.redo', 'Ctrl+Y'],
    ['edit.copyMarkdown', 'Ctrl+Shift+C'],
    ['edit.moveRowUp', 'Alt+Up'],
    ['para.paragraph', 'Ctrl+0'],
    ['para.increaseHeading', 'Ctrl+='],
    ['para.mathBlock', 'Ctrl+Shift+M'],
    ['para.codeFence', 'Ctrl+Shift+K'],
    ['para.orderedList', 'Ctrl+Shift+['],
    ['para.unorderedList', 'Ctrl+Shift+]'],
    ['para.taskList', 'Ctrl+Shift+X'],
    ['format.strike', 'Alt+Shift+5'],
    ['format.clear', 'Ctrl+\\'],
    ['format.code', 'Ctrl+Shift+`'],
    ['view.toggleSidebar', 'Ctrl+Shift+L'],
    ['view.sourceMode', 'Ctrl+/'],
    ['view.focusMode', 'F8'],
    ['view.typewriter', 'F9'],
    ['view.actualSize', 'Ctrl+Shift+9'],
    ['view.zoomIn', 'Ctrl+Shift+='],
    ['view.switchDocs', 'Ctrl+Tab'],
    ['view.devTools', 'Shift+F12'],
  ]

  for (const [id, accel] of expected) {
    it(`${id} is ${accel}`, () => expect(accelOf(id)).toBe(accel))
  }

  it('assigns Ctrl+1..Ctrl+6 to the six heading levels', () => {
    for (let i = 1; i <= 6; i++) expect(accelOf(`para.h${i}`)).toBe(`Ctrl+${i}`)
  })
})
