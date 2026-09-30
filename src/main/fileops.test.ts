import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFile, createFolder } from './fileops'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fileops-test-'))
  mkdirSync(join(root, 'sub'))
  writeFileSync(join(root, 'sub', 'kept.md'), 'Already here.\n')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('createFile', () => {
  it('makes an empty markdown file, adding .md', async () => {
    const path = await createFile(root, join(root, 'sub'), 'Trip notes')
    expect(path).toBe(join(root, 'sub', 'Trip notes.md'))
    expect(readFileSync(path, 'utf8')).toBe('')
  })

  it('keeps an extension that is already markdown', async () => {
    expect(await createFile(root, root, 'a.markdown')).toBe(join(root, 'a.markdown'))
  })

  it('never writes over a file that is there', async () => {
    await expect(createFile(root, join(root, 'sub'), 'kept')).rejects.toThrow(/already/)
    expect(readFileSync(join(root, 'sub', 'kept.md'), 'utf8')).toBe('Already here.\n')
  })

  it('refuses a name Windows cannot store, and anywhere outside the folder', async () => {
    await expect(createFile(root, root, 'a:b')).rejects.toThrow()
    await expect(createFile(root, root, '../escaped')).rejects.toThrow()
    await expect(createFile(root, tmpdir(), 'outside')).rejects.toThrow()
    expect(existsSync(join(tmpdir(), 'outside.md'))).toBe(false)
  })
})

describe('createFolder', () => {
  it('makes a folder', async () => {
    const path = await createFolder(root, root, 'drafts')
    expect(statSync(path).isDirectory()).toBe(true)
  })

  it('refuses one that is there', async () => {
    await expect(createFolder(root, root, 'sub')).rejects.toThrow(/already/)
  })
})
