// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectEncoding, detectEol, readTextFile, renameWithRetry, writeTextFile } from './textfile'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ekmd-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('detectEncoding', () => {
  it('recognizes a UTF-8 BOM', () => {
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toEqual({
      encoding: 'utf8',
      hasBom: true,
    })
  })
  it('recognizes UTF-16 BOMs in both byte orders', () => {
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x61, 0x00]))).toEqual({
      encoding: 'utf16le',
      hasBom: true,
    })
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x61]))).toEqual({
      encoding: 'utf16be',
      hasBom: true,
    })
  })
  it('defaults to UTF-8 with no BOM', () => {
    expect(detectEncoding(Buffer.from('plain', 'utf8'))).toEqual({
      encoding: 'utf8',
      hasBom: false,
    })
  })
})

describe('detectEol', () => {
  it('detects LF and CRLF', () => {
    expect(detectEol('a\nb\nc')).toBe('\n')
    expect(detectEol('a\r\nb\r\nc')).toBe('\r\n')
  })
  it('follows the majority in a mixed file', () => {
    expect(detectEol('a\r\nb\r\nc\nd')).toBe('\r\n')
    expect(detectEol('a\nb\nc\r\nd')).toBe('\n')
  })
})

describe('round-tripping a file unchanged', () => {
  /**
   * The guarantee that matters: reading a file and writing it straight back
   * must reproduce the original bytes exactly, whatever its encoding, BOM and
   * line endings. Anything less turns every save into a whole-file diff.
   */
  const cases: Array<[string, Buffer]> = [
    ['utf8 lf', Buffer.from('# Title\n\nBody text.\n', 'utf8')],
    ['utf8 crlf', Buffer.from('# Title\r\n\r\nBody text.\r\n', 'utf8')],
    [
      'utf8 bom lf',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# T\nx\n', 'utf8')]),
    ],
    [
      'utf8 bom crlf',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# T\r\nx\r\n', 'utf8')]),
    ],
    [
      'utf16le bom',
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# T\r\nx\r\n', 'utf16le')]),
    ],
    ['unicode content', Buffer.from('café 日本語 🎉\nsecond\n', 'utf8')],
    ['no trailing newline', Buffer.from('no newline at end', 'utf8')],
  ]

  for (const [name, original] of cases) {
    it(`preserves bytes: ${name}`, async () => {
      const p = join(dir, 'note.md')
      await writeFile(p, original)

      const f = await readTextFile(p)
      await writeTextFile(p, f.content, f)

      expect(await readFile(p)).toEqual(original)
    })
  }

  it('preserves UTF-16BE content through a round-trip', async () => {
    const body = Buffer.from('# T\r\nx\r\n', 'utf16le')
    body.swap16()
    const original = Buffer.concat([Buffer.from([0xfe, 0xff]), body])
    const p = join(dir, 'be.md')
    await writeFile(p, original)

    const f = await readTextFile(p)
    expect(f.content).toBe('# T\nx\n')
    await writeTextFile(p, f.content, f)
    expect(await readFile(p)).toEqual(original)
  })
})

describe('writeTextFile', () => {
  it("normalizes content to the file's own line endings", async () => {
    const p = join(dir, 'crlf.md')
    await writeTextFile(p, 'a\nb\n', { encoding: 'utf8', hasBom: false, eol: '\r\n' })
    expect((await readFile(p)).toString('utf8')).toBe('a\r\nb\r\n')
  })

  it('leaves no temp files behind', async () => {
    const p = join(dir, 'x.md')
    await writeTextFile(p, 'hello\n', { encoding: 'utf8', hasBom: false, eol: '\n' })
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('leaves the original intact when the write fails', async () => {
    const p = join(dir, 'sub', 'missing.md') // parent does not exist
    await expect(
      writeTextFile(p, 'x', { encoding: 'utf8', hasBom: false, eol: '\n' })
    ).rejects.toThrow()
  })
})

describe('renameWithRetry', () => {
  /** A rename that fails with the given codes in turn, then succeeds. */
  function flaky(codes: string[]) {
    const calls: string[] = []
    const doRename = async (): Promise<void> => {
      const code = codes[calls.length]
      calls.push(code ?? 'ok')
      if (code) throw Object.assign(new Error(code), { code })
    }
    return { doRename, calls }
  }
  const noWait = async (): Promise<void> => {}

  it('succeeds once another program lets go of the file', async () => {
    // What a sync client or antivirus scan looks like: held briefly, then free.
    const { doRename, calls } = flaky(['EBUSY', 'EPERM'])
    await renameWithRetry('a', 'b', doRename, [1, 1, 1], noWait)
    expect(calls).toEqual(['EBUSY', 'EPERM', 'ok'])
  })

  it('gives up after its budget, reporting the real error', async () => {
    const { doRename, calls } = flaky(['EPERM', 'EPERM', 'EPERM', 'EPERM'])
    await expect(renameWithRetry('a', 'b', doRename, [1, 1, 1], noWait)).rejects.toMatchObject({
      code: 'EPERM',
    })
    // One attempt plus one per delay.
    expect(calls).toHaveLength(4)
  })

  it('does not wait on an error that waiting cannot fix', async () => {
    const { doRename, calls } = flaky(['ENOENT'])
    await expect(renameWithRetry('a', 'b', doRename, [1, 1, 1], noWait)).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(calls).toEqual(['ENOENT'])
  })
})
