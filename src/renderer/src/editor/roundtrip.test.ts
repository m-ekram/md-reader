import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEditor, type EditorHandle } from './crepe'
import { checkRoundTrip } from './roundtrip'

/**
 * What the round-trip warning says, checked against the editor's real output.
 *
 * It used to name what a file *contained* — any callout, front matter or
 * [TOC] marker — not what saving would change. Those three survive a save;
 * tables do not. So a file with a table and a callout was told "Saving may
 * alter callouts", about the one thing that was safe.
 */
let handle: EditorHandle
let root: HTMLElement

beforeAll(async () => {
  root = document.createElement('div')
  document.body.appendChild(root)
  handle = await createEditor({ root, value: '', onChange: () => {} })
}, 60_000)

afterAll(async () => {
  await handle?.destroy()
  root?.remove()
})

const report = (md: string) => checkRoundTrip(md, handle.reserialize(md))

describe('the round-trip warning', () => {
  it('names the table, not the callout beside it', () => {
    const md = '> [!NOTE]\n> Safe to save.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'
    const r = report(md)
    expect(r.lossy).toBe(true)
    expect(r.note).toContain('tables')
    expect(r.note).not.toContain('callouts')
  })

  it('says nothing about front matter, callouts or a TOC marker, which all survive', () => {
    const md = '---\ntitle: T\n---\n\n[TOC]\n\n> [!TIP]\n> Kept.\n\nPlain text.'
    expect(report(md).lossy).toBe(false)
  })

  it.each([
    ['tables', '| l | c |\n| :-- | :-: |\n| 1 | 2 |'],
    ['reference-style links', 'See [the docs][ref].\n\n[ref]: https://example.com'],
    ['line breaks', 'line one  \nline two'],
    ['HTML entities', 'Caf&eacute; &amp; bar'],
    ['underlined headings', 'Title\n=====\n\nText.'],
    ['indented code', 'Text:\n\n    indented code\n    second line'],
    ['literal * and _', 'A literal * asterisk and _ underscore.'],
  ])('names %s when those are what would change', (name, md) => {
    const r = report(md)
    expect(r.lossy).toBe(true)
    expect(r.note).toContain(name)
  })

  it('says where the first change is', () => {
    const md = '# Heading\n\nText.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'
    const r = report(md)
    expect(r.firstDiffLine).toBe(6)
    expect(r.note).toContain('line 6')
  })
})
