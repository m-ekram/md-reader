import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('./log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { readSettingsFile, writeSettingsFile } = await import('./settings')
const { DEFAULT_SETTINGS } = await import('../shared/settings')

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
  path = join(dir, 'settings.json')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('readSettingsFile', () => {
  it('uses defaults quietly when there is no file yet', () => {
    expect(readSettingsFile(path)).toEqual(DEFAULT_SETTINGS)
    // Nothing to preserve, so nothing is created.
    expect(readdirSync(dir)).toEqual([])
  })

  it('reads a valid file', () => {
    writeFileSync(path, JSON.stringify({ theme: 'night' }))
    expect(readSettingsFile(path).theme).toBe('night')
    expect(existsSync(path)).toBe(true)
  })

  it('keeps the folder that was open', () => {
    // Its default is "none", null, which the merge took as the type a stored
    // value had to match: every saved folder was dropped, and the app forgot
    // the open folder at every launch.
    writeFileSync(path, JSON.stringify({ workspace: 'C:\\notes' }))
    expect(readSettingsFile(path).workspace).toBe('C:\\notes')
  })

  it('does not take a value of the wrong kind for a setting that may be empty', () => {
    writeFileSync(path, JSON.stringify({ workspace: 42 }))
    expect(readSettingsFile(path).workspace).toBeNull()
  })

  it('keeps a corrupt file aside instead of losing it', () => {
    // A trailing comma: the kind of damage a hand edit leaves.
    const broken = '{ "theme": "newsprint", }'
    writeFileSync(path, broken)

    const settings = readSettingsFile(path, new Date('2026-09-21T10:00:00Z'))

    expect(settings).toEqual(DEFAULT_SETTINGS)
    // The original is gone from its place, so the next write cannot overwrite it…
    expect(existsSync(path)).toBe(false)
    // …because it was moved, byte for byte, to a name that says what happened.
    const aside = readdirSync(dir).filter((f) => f.includes('corrupt'))
    expect(aside).toHaveLength(1)
    expect(aside[0]).toMatch(/^settings\.corrupt-2026-09-21T10-00-00-000Z\.json$/)
    expect(readFileSync(join(dir, aside[0]), 'utf8')).toBe(broken)
  })
})

describe('writeSettingsFile', () => {
  it('writes settings that read back', () => {
    writeSettingsFile(path, { ...DEFAULT_SETTINGS, theme: 'sepia' })
    expect(readSettingsFile(path).theme).toBe('sepia')
  })

  it('keeps the previous settings when a write is cut short', () => {
    // A crash, a power cut or a full disk partway through a write. Written in
    // place, that left a truncated file, which the next launch set aside as
    // corrupt: every setting — theme, recent files, workspace — was lost.
    writeFileSync(path, JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'night' }))
    const cutShort = ((p: string, data: string) => {
      writeFileSync(p, data.slice(0, 20))
      throw new Error('ENOSPC: no space left on device')
    }) as unknown as typeof writeFileSync

    expect(() =>
      writeSettingsFile(path, { ...DEFAULT_SETTINGS, theme: 'sepia' }, cutShort)
    ).toThrow()
    expect(readSettingsFile(path).theme).toBe('night')
  })
})
