// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allMarkdown, isMarkdown, loadIgnores, readDirectory } from './workspace'

vi.mock('./log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ekmd-ws-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function file(rel: string, body = 'x'): Promise<void> {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, body, 'utf8')
}

describe('isMarkdown', () => {
  it('accepts the extensions we open', () => {
    for (const n of ['a.md', 'a.markdown', 'a.mdown', 'a.mkd', 'a.mdx', 'A.MD']) {
      expect(isMarkdown(n), n).toBe(true)
    }
  })

  it('rejects everything else', () => {
    for (const n of ['a.txt', 'a.png', 'a', 'a.md.bak', 'mdx']) {
      expect(isMarkdown(n), n).toBe(false)
    }
  })
})

describe('readDirectory', () => {
  it('lists folders first, then markdown files, each alphabetically', async () => {
    await file('zebra.md')
    await file('alpha.md')
    await file('sub/inner.md')
    await mkdir(join(root, 'abc'), { recursive: true })

    const entries = await readDirectory(root)
    expect(entries.map((e) => e.name)).toEqual(['abc', 'sub', 'alpha.md', 'zebra.md'])
    expect(entries[0].isDirectory).toBe(true)
  })

  it('hides non-markdown files', async () => {
    await file('note.md')
    await file('image.png')
    await file('data.json')

    expect((await readDirectory(root)).map((e) => e.name)).toEqual(['note.md'])
  })

  it('skips dot-directories and build folders', async () => {
    await file('.git/config')
    await file('node_modules/pkg/index.js')
    await file('.hidden/secret.md')
    await file('real.md')

    expect((await readDirectory(root)).map((e) => e.name)).toEqual(['real.md'])
  })

  it('is one level deep only, so the tree can load lazily', async () => {
    await file('sub/deep/inner.md')
    const entries = await readDirectory(root)
    // "sub" is listed, its contents are not.
    expect(entries.map((e) => e.name)).toEqual(['sub'])
  })
})

describe('loadIgnores', () => {
  it('returns an empty set when there is no .gitignore', async () => {
    expect((await loadIgnores(root)).size).toBe(0)
  })

  it('reads plain names, ignoring comments, blanks and negations', async () => {
    await file('.gitignore', '# a comment\n\nbuild\ndist/\n!keep\n/rooted\n')
    const ignores = await loadIgnores(root)

    expect(ignores.has('build')).toBe(true)
    expect(ignores.has('dist')).toBe(true) // trailing slash stripped
    expect(ignores.has('rooted')).toBe(true) // leading slash stripped
    expect(ignores.has('keep')).toBe(false) // negation is not an ignore
    expect(ignores.has('# a comment')).toBe(false)
  })

  it('skips glob patterns rather than mishandling them', async () => {
    // Deliberately not a full gitignore implementation; the goal is avoiding a
    // walk into build output, not reproducing git's matching rules.
    await file('.gitignore', '*.log\ntemp?\nplain\n')
    const ignores = await loadIgnores(root)

    expect(ignores.has('plain')).toBe(true)
    expect(ignores.has('*.log')).toBe(false)
    expect(ignores.has('temp?')).toBe(false)
  })
})

describe('allMarkdown', () => {
  it('finds markdown at every depth, flat and sorted', async () => {
    await file('b.md')
    await file('a.md')
    await file('sub/c.md')
    await file('sub/deeper/d.md')

    const found = await allMarkdown(root)
    expect(found.map((f) => f.relativePath)).toEqual([
      'a.md',
      'b.md',
      'sub/c.md',
      'sub/deeper/d.md',
    ])
  })

  it('uses forward slashes in relative paths, whatever the platform', async () => {
    await file('sub/deeper/note.md')
    const found = await allMarkdown(root)
    expect(found[0].relativePath).toBe('sub/deeper/note.md')
    expect(found[0].relativePath).not.toContain('\\')
  })

  it('honours .gitignore', async () => {
    await file('.gitignore', 'vendor\n')
    await file('keep.md')
    await file('vendor/skip.md')

    const found = await allMarkdown(root)
    expect(found.map((f) => f.name)).toEqual(['keep.md'])
  })

  it('skips .git and node_modules without being told', async () => {
    await file('.git/notes.md')
    await file('node_modules/pkg/readme.md')
    await file('mine.md')

    expect((await allMarkdown(root)).map((f) => f.name)).toEqual(['mine.md'])
  })

  it('stops at the depth cap rather than walking forever', async () => {
    await file('a/b/c/d/deep.md')
    const shallow = await allMarkdown(root, { maxDepth: 2 })
    expect(shallow).toHaveLength(0)

    const deep = await allMarkdown(root, { maxDepth: 12 })
    expect(deep).toHaveLength(1)
  })

  it('stops at the file cap, so a wrong folder cannot hang the app', async () => {
    for (let i = 0; i < 12; i++) await file(`note-${i}.md`)
    const capped = await allMarkdown(root, { maxFiles: 5 })
    expect(capped.length).toBeLessThanOrEqual(5)
  })

  it('reports size and modification time for each file', async () => {
    await file('sized.md', 'hello world')
    const [found] = await allMarkdown(root)
    expect(found.size).toBe(11)
    expect(found.mtimeMs).toBeGreaterThan(0)
  })

  it('returns nothing for an empty folder', async () => {
    expect(await allMarkdown(root)).toEqual([])
  })
})
