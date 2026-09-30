import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveInside, validName } from './paths'

let base: string
let root: string

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'paths-test-'))
  root = join(base, 'ws')
  mkdirSync(join(root, 'notes'), { recursive: true })
  writeFileSync(join(root, 'notes', 'a.md'), '# A\n')
  // A sibling whose name starts with the root's: "ws2" begins with "ws".
  mkdirSync(join(base, 'ws2'))
  writeFileSync(join(base, 'ws2', 'b.md'), '# B\n')
  mkdirSync(join(base, 'outside'))
  // A link inside the folder to a folder outside it. A junction, which needs
  // no special rights on Windows.
  symlinkSync(join(base, 'outside'), join(root, 'escape'), 'junction')
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('resolveInside', () => {
  it('takes a file or folder inside the open folder', async () => {
    expect(await resolveInside(root, join(root, 'notes', 'a.md'))).toBe(join(root, 'notes', 'a.md'))
    expect(await resolveInside(root, join(root, 'notes'))).toBe(join(root, 'notes'))
  })

  it('takes a path that does not exist yet, for something being made', async () => {
    expect(await resolveInside(root, join(root, 'notes', 'new.md'))).toBe(
      join(root, 'notes', 'new.md')
    )
  })

  it('refuses the folder itself unless asked to allow it', async () => {
    await expect(resolveInside(root, root)).rejects.toThrow()
    expect(await resolveInside(root, root, { allowRoot: true })).toBe(root)
  })

  it('refuses a way out with ..', async () => {
    await expect(
      resolveInside(root, join(root, 'notes', '..', '..', 'ws2', 'b.md'))
    ).rejects.toThrow()
  })

  it('refuses a folder whose name only starts like the open one', async () => {
    await expect(resolveInside(root, join(base, 'ws2', 'b.md'))).rejects.toThrow()
  })

  it('refuses anywhere else on the disk', async () => {
    await expect(resolveInside(root, join(base, 'outside'))).rejects.toThrow()
    await expect(resolveInside(root, tmpdir())).rejects.toThrow()
  })

  it('refuses a link that leads outside', async () => {
    await expect(resolveInside(root, join(root, 'escape', 'x.md'))).rejects.toThrow()
  })

  it('refuses what is not a path', async () => {
    await expect(resolveInside(root, 42 as unknown as string)).rejects.toThrow()
    await expect(resolveInside(root, '')).rejects.toThrow()
  })

  it.runIf(process.platform === 'win32')('ignores case, as Windows does', async () => {
    expect(await resolveInside(root, join(root.toUpperCase(), 'NOTES', 'A.MD'))).toBeTruthy()
  })
})

describe('validName', () => {
  it('takes an ordinary name', () => {
    expect(validName('Trip notes.md')).toBeNull()
    expect(validName('2026-09-30')).toBeNull()
  })

  it('refuses separators and characters Windows will not store', () => {
    for (const name of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b']) {
      expect(validName(name), name).not.toBeNull()
    }
  })

  it('refuses names Windows keeps for devices, with or without an extension', () => {
    for (const name of ['CON', 'con.md', 'NUL', 'com1', 'LPT9.txt', 'aux']) {
      expect(validName(name), name).not.toBeNull()
    }
    expect(validName('console.md')).toBeNull()
  })

  it('refuses a name ending in a dot or a space, which Windows would drop', () => {
    expect(validName('notes.')).not.toBeNull()
    expect(validName('notes ')).not.toBeNull()
  })

  it('refuses nothing at all, and the names for here and the folder above', () => {
    for (const name of ['', '   ', '.', '..'])
      expect(validName(name), JSON.stringify(name)).not.toBeNull()
  })
})
