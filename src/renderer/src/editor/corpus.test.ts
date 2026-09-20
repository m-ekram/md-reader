import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEditor, type EditorHandle } from './crepe'
import { fixtures } from '../../../../spike/fixtures'

/**
 * The round-trip corpus, run against the editor the application actually
 * builds — not a hand-rolled configuration like the Phase 0 spike used.
 *
 * This is the living guarantee behind "saving a file you did not edit does not
 * change it". Every construct we claim to model gets a fixture here, and any
 * new node added in a later phase must arrive with one.
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

const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n+$/, '')

/** Constructs the shipping editor is expected to preserve exactly. */
const MUST_ROUND_TRIP = [
  'atx headings',
  'paragraph',
  'emphasis',
  'strikethrough (gfm)',
  'inline code',
  'code fence (lang)',
  'code fence (no lang)',
  'blockquote',
  'nested blockquote',
  'unordered list',
  'ordered list',
  'nested list',
  'mixed nested list',
  'task list (gfm)',
  'loose list',
  'link',
  'link with title',
  'autolink',
  'image',
  'thematic break',
  'escaped chars',
  'inline html',
  'html comment',
  'html block',
  'footnote (gfm)',
  'yaml front matter',
  'inline math',
  'block math',
  'mermaid fence',
  'emoji shortcode',
  'unicode + cjk',
  'long paragraph (no rewrap)',
  'backslash break',
  'github alert',
  'toc directive',
]

describe('round-trip corpus (shipping editor)', () => {
  for (const name of MUST_ROUND_TRIP) {
    const fixture = fixtures.find((f) => f.name === name)
    it(`preserves: ${name}`, () => {
      expect(fixture, `fixture "${name}" is missing`).toBeDefined()
      const out = handle.reserialize(fixture!.md)
      expect(norm(out), `\n--- in ---\n${fixture!.md}\n--- out ---\n${out}\n`).toBe(norm(fixture!.md))
    })
  }

  /**
   * Constructs known not to survive exactly, each for a reason we accept.
   *
   * Asserted as an exact set rather than a count: an unexpected name appearing
   * is a regression, and a name disappearing means something was fixed and this
   * list owes an update. Both should fail loudly rather than pass quietly.
   */
  const KNOWN_LOSSY = [
    'hard line break', //      two-space becomes a backslash; renders identically
    'html entity', //          entities decode to characters; renders identically
    'indented code block', //  normalized to a fenced block
    'literal asterisk (unescaped)', // protective escapes added, which is safer
    'reference link', //       definition inlined; the link still works
    'setext heading', //       normalized to ATX
    'table (gfm)', //          delimiter row narrows; content preserved
    'table alignment', //      cell padding normalized; alignment preserved
  ]

  it('loses exactly the constructs we know about, and no others', () => {
    const failing = fixtures
      .filter((f) => {
        try {
          return norm(handle.reserialize(f.md)) !== norm(f.md)
        } catch {
          return true
        }
      })
      .map((f) => f.name)
      .sort()

    expect(failing).toEqual([...KNOWN_LOSSY].sort())
  })
})
