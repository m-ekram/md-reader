import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * `readUserTheme` takes an id from the renderer and turns it into a path. The
 * renderer is our own code, but an id is an id: it must never be able to name
 * a file outside the themes folder, whatever it contains.
 */
const root = mkdtempSync(join(tmpdir(), 'themes-test-'))
const userData = join(root, 'userData')
const themesDir = join(userData, 'themes')

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('./log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { readUserTheme } = await import('./themes')

beforeAll(() => {
  mkdirSync(themesDir, { recursive: true })
  writeFileSync(join(themesDir, 'mine.css'), ':root[data-theme="mine"] { --doc-bg: red; }')
  // A stylesheet outside the themes folder that an escaping id could reach.
  writeFileSync(join(userData, 'secret.css'), 'SECRET')
  writeFileSync(join(root, 'outside.css'), 'OUTSIDE')
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('readUserTheme', () => {
  it('reads a theme that is in the folder', () => {
    expect(readUserTheme('mine')).toContain('--doc-bg')
  })

  it.each([
    ['a parent-directory id', '../secret'],
    ['a deeper escape', '../../outside'],
    ['a Windows-style escape', '..\\secret'],
    ['an absolute path', join(root, 'outside')],
    ['a drive-qualified path', 'C:/Windows/win'],
  ])('reads nothing for %s', (_label, id) => {
    const css = readUserTheme(id)
    expect(css).toBe('')
    expect(css).not.toContain('SECRET')
    expect(css).not.toContain('OUTSIDE')
  })

  it('reads nothing for a theme that does not exist', () => {
    expect(readUserTheme('nope')).toBe('')
  })
})
