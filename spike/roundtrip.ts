/**
 * Phase 0 round-trip guard.
 *
 * A WYSIWYG markdown editor never writes your original bytes back: it parses to a
 * ProseMirror document and re-serializes. Anything the schema does not model is lost
 * the moment the file is saved. This module measures exactly what survives.
 *
 * It is the prototype of `renderer/src/editor/roundtrip.ts`, which runs on every file
 * open to warn the user *before* they edit a file we cannot represent losslessly.
 */
import {
  Editor,
  rootCtx,
  parserCtx,
  serializerCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'

export interface RoundTripResult {
  input: string
  output: string
  /** Byte-identical ignoring only a single trailing newline. */
  lossless: boolean
  /** First differing line, 1-indexed, or null when lossless. */
  firstDiffLine: number | null
  error?: string
}

export interface RoundTripper {
  run(markdown: string): RoundTripResult
  destroy(): void
}

/** Normalizes away the one difference we consider cosmetic rather than lossy. */
function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

function firstDifference(a: string, b: string): number | null {
  const al = a.split('\n')
  const bl = b.split('\n')
  const n = Math.max(al.length, bl.length)
  for (let i = 0; i < n; i++) {
    if (al[i] !== bl[i]) return i + 1
  }
  return null
}

/**
 * Serializer options tuned to emit conventional markdown, so re-serializing a
 * normal file is a no-op rather than a reformat. Measured in Phase 0: this alone
 * closes most of the purely cosmetic round-trip failures.
 */
export const conventionalStringifyOptions = {
  bullet: '-' as const,
  rule: '-' as const,
  emphasis: '*' as const,
  strong: '*' as const,
  fence: '`' as const,
  fences: true,
  listItemIndent: 'one' as const,
  setext: false,
  tightDefinitions: true,
}

export async function createRoundTripper(
  opts: { conventional?: boolean } = {}
): Promise<RoundTripper> {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      if (opts.conventional) {
        const prev = ctx.get(remarkStringifyOptionsCtx)
        ctx.set(remarkStringifyOptionsCtx, { ...prev, ...conventionalStringifyOptions })
      }
    })
    .use(commonmark)
    .use(gfm)
    .create()

  return {
    run(markdown: string): RoundTripResult {
      let output = ''
      let error: string | undefined

      try {
        editor.action((ctx) => {
          const parse = ctx.get(parserCtx)
          const serialize = ctx.get(serializerCtx)
          const doc = parse(markdown)
          if (!doc) throw new Error('parser returned null')
          output = serialize(doc)
        })
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }

      const a = normalize(markdown)
      const b = normalize(output)
      const lossless = !error && a === b

      return {
        input: markdown,
        output,
        lossless,
        firstDiffLine: lossless ? null : firstDifference(a, b),
        error,
      }
    },
    destroy() {
      editor.destroy()
      root.remove()
    },
  }
}
