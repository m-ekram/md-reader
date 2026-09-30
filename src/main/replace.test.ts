import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('./recovery', () => ({ backup: vi.fn() }))
vi.mock('./log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { applyReplace, previewReplace } = await import('./replace')
const { backup } = await import('./recovery')

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'replace-test-'))
  writeFileSync(join(root, 'a.md'), 'A cat and a cat.\n\nNo dogs.\n')
  // Windows line endings, which must survive.
  writeFileSync(join(root, 'b.md'), 'One cat.\r\nTwo lines.\r\n')
  writeFileSync(join(root, 'none.md'), 'Nothing here.\n')
  vi.mocked(backup).mockClear()
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const spec = { query: 'cat', replacement: 'dog' }

describe('previewReplace', () => {
  it('lists each file that would change, with its count and a line before and after', async () => {
    const files = await previewReplace(root, spec, [])
    const byName = Object.fromEntries(files.map((f) => [f.relativePath, f]))
    expect(Object.keys(byName).sort()).toEqual(['a.md', 'b.md'])
    expect(byName['a.md'].count).toBe(2)
    expect(byName['a.md'].samples[0]).toEqual({
      line: 1,
      before: 'A cat and a cat.',
      after: 'A dog and a dog.',
    })
  })

  it('leaves out the files the page has open, whose text it holds', async () => {
    const files = await previewReplace(root, spec, [join(root, 'a.md')])
    expect(files.map((f) => f.relativePath)).toEqual(['b.md'])
  })

  it('uses groups for a regular expression', async () => {
    const [file] = await previewReplace(
      root,
      { query: 'One (\\w+)', regexp: true, replacement: '$1 one' },
      []
    )
    expect(file.samples[0].after).toBe('cat one.')
  })
})

describe('applyReplace', () => {
  it('writes each file in its own format, after a backup', async () => {
    const files = await previewReplace(root, spec, [])
    const result = await applyReplace(root, spec, files)
    expect(result.skipped).toEqual([])
    expect(result.done.reduce((n, d) => n + d.count, 0)).toBe(3)
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('A dog and a dog.\n\nNo dogs.\n')
    expect(readFileSync(join(root, 'b.md'), 'utf8')).toBe('One dog.\r\nTwo lines.\r\n')
    expect(backup).toHaveBeenCalledTimes(2)
  })

  it('skips a file changed since the preview, and says so', async () => {
    const files = await previewReplace(root, spec, [])
    const a = join(root, 'a.md')
    writeFileSync(a, 'Rewritten: cat.\n')
    const later = new Date(statSync(a).mtimeMs + 5000)
    utimesSync(a, later, later)

    const result = await applyReplace(root, spec, files)
    expect(result.skipped).toEqual([{ path: a, reason: 'it changed since the preview' }])
    expect(readFileSync(a, 'utf8')).toBe('Rewritten: cat.\n')
    expect(readFileSync(join(root, 'b.md'), 'utf8')).toBe('One dog.\r\nTwo lines.\r\n')
  })

  it('refuses a file outside the open folder', async () => {
    const result = await applyReplace(root, spec, [{ path: join(tmpdir(), 'x.md'), mtimeMs: 0 }])
    expect(result.done).toEqual([])
    expect(result.skipped).toHaveLength(1)
  })
})
