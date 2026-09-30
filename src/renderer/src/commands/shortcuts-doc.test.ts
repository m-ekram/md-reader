import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXTRA_COMMANDS, MENUS, flattenMenu } from './menus'

/**
 * The keyboard shortcuts table in Help ▸ More Topics, against the menus.
 *
 * Written by hand, a list of shortcuts goes out of date the first time one
 * changes. Checked both ways: every shortcut the app binds is listed, and
 * every one listed is bound, to the command named.
 */
const topics = readFileSync(join(__dirname, '../../../../docs/topics.md'), 'utf8')

/** `Ctrl+B`, or `` Ctrl+Shift+` `` for one containing a backtick. */
function unquote(cell: string): string {
  return cell.trim().replace(/^(`+)\s?([\s\S]*?)\s?\1$/, '$2')
}

function documented(): string[] {
  const section = topics.split(/^## /m).find((s) => s.startsWith('Keyboard shortcuts'))
  if (!section) return []
  return section
    .split('\n')
    .filter((line) => /^\|/.test(line) && !/^\|\s*-/.test(line))
    .slice(1) // the header row
    .map((line) => {
      // Cells split on pipes outside code spans: none of the shortcuts has one.
      const cells = line.split('|').slice(1, -1)
      return `${cells[1].trim()} = ${unquote(cells[2])}`
    })
}

function bound(): string[] {
  const menu = flattenMenu(MENUS)
    .filter((e) => e.accel)
    .map((e) => `${e.label.replace(/…$/, '')} = ${e.accel}`)
  const extra = EXTRA_COMMANDS.filter((c) => c.accel).map((c) => `${c.label} = ${c.accel}`)
  return [...menu, ...extra]
}

describe('the keyboard shortcuts in Help', () => {
  it('lists every shortcut the app binds', () => {
    const listed = new Set(documented())
    expect(bound().filter((b) => !listed.has(b))).toEqual([])
  })

  it('lists no shortcut the app does not bind, or binds to something else', () => {
    const real = new Set(bound())
    expect(documented().filter((d) => !real.has(d))).toEqual([])
  })
})
