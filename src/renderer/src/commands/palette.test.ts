import { describe, it, expect } from 'vitest'
import { MENUS, allMenuCommandIds, flattenMenu, EXTRA_ACCELERATORS } from './menus'
import { fuzzyScore } from '../utils/fuzzy'

describe('flattenMenu', () => {
  const flat = flattenMenu()

  it('reaches items nested inside submenus', () => {
    const addRow = flat.find((e) => e.id === 'para.addRowAbove')
    expect(addRow, 'a submenu item must survive flattening').toBeDefined()
    expect(addRow?.path).toContain('Paragraph')
    expect(addRow?.path).toContain('Table')
  })

  it('covers exactly the ids the menu declares', () => {
    // The palette renders from this, so anything the flattener misses is a
    // command the user cannot reach by search even though the menu offers it.
    expect(flat.map((e) => e.id).sort()).toEqual([...allMenuCommandIds()].sort())
  })

  it('carries accelerators through', () => {
    expect(flat.find((e) => e.id === 'file.save')?.accel).toBe('Ctrl+S')
  })

  it('separates each level of the path', () => {
    // The menu is two levels at most: a top-level menu and one submenu.
    const nested = flat.find((e) => e.path.split('›').length === 2)
    expect(nested, 'at least one item sits inside a submenu').toBeDefined()
  })
})

describe('accelerators outside the menu', () => {
  it('do not collide with one the menu already claims', () => {
    const claimed = new Set(
      flattenMenu(MENUS)
        .map((e) => e.accel)
        .filter(Boolean)
    )
    for (const extra of EXTRA_ACCELERATORS) {
      expect(claimed.has(extra.accel), `${extra.accel} is already a menu accelerator`).toBe(false)
    }
  })
})

describe('fuzzyScore', () => {
  it('matches a subsequence', () => {
    expect(fuzzyScore('frontmatter.md', 'frnt')).not.toBeNull()
  })

  it('rejects what does not fit, in order', () => {
    expect(fuzzyScore('frontmatter.md', 'xyz')).toBeNull()
    // Right letters, wrong order: still not a subsequence.
    expect(fuzzyScore('abc', 'cba')).toBeNull()
  })

  it('scores a contiguous prefix above a scattered match', () => {
    const contiguous = fuzzyScore('table', 'tab')
    const scattered = fuzzyScore('the alphabet', 'tab')
    expect(contiguous).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(contiguous!).toBeGreaterThan(scattered!)
  })

  it('treats an empty pattern as matching everything', () => {
    expect(fuzzyScore('anything', '')).toBe(0)
  })

  it('rewards a match starting after a separator', () => {
    // "row" at a word boundary should beat the same letters mid-word.
    const boundary = fuzzyScore('add row above', 'row')
    const midWord = fuzzyScore('arrowhead', 'row')
    expect(boundary!).toBeGreaterThan(midWord!)
  })
})
