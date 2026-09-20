import { describe, it, beforeAll, afterAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { parserCtx, serializerCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import { fixtures } from './fixtures'
import { conventionalStringifyOptions } from './roundtrip'

/**
 * The app ships Crepe, not bare commonmark+gfm, so this is the number that
 * actually matters. Crepe adds the Latex feature (remark-math), which should
 * rescue the math fixtures.
 */
let crepe: Crepe
let root: HTMLElement

beforeAll(async () => {
  root = document.createElement('div')
  document.body.appendChild(root)
  crepe = new Crepe({
    root,
    defaultValue: '',
    features: {
      [CrepeFeature.AI]: false,
      [CrepeFeature.TopBar]: false,
    },
  })
  // Must be set BEFORE create(): Milkdown builds its remark instance at init
  // time, so configuring after creation silently has no effect.
  crepe.editor.config((ctx) => {
    const prev = ctx.get(remarkStringifyOptionsCtx)
    ctx.set(remarkStringifyOptionsCtx, { ...prev, ...conventionalStringifyOptions })
  })
  await crepe.create()
}, 60_000)

afterAll(async () => {
  await crepe?.destroy()
  root?.remove()
})

describe('crepe round-trip (the shipping configuration)', () => {
  it('reports fidelity', () => {
    const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n+$/, '')

    const rows = fixtures.map((f) => {
      let out = ''
      let err = ''
      try {
        crepe.editor.action((ctx) => {
          const doc = ctx.get(parserCtx)(f.md)
          if (!doc) throw new Error('parse returned null')
          out = ctx.get(serializerCtx)(doc)
        })
      } catch (e) {
        err = e instanceof Error ? e.message : String(e)
      }
      return { name: f.name, gap: f.expectedGap, ok: !err && norm(f.md) === norm(out), out, err }
    })

    const ok = rows.filter((r) => r.ok).length
    const L: string[] = []
    L.push('# Phase 0 - Crepe round-trip (shipping config)', '')
    L.push(`Crepe 7.22.1, all features except AI and TopBar, tuned serializer.`, '')
    L.push(`**Lossless: ${ok}/${rows.length}**`, '')
    L.push('| construct | result | note |', '|---|---|---|')
    for (const r of rows) {
      L.push(
        `| ${r.name} | ${r.ok ? 'ok' : 'LOSSY'} | ${r.ok ? '' : r.err || r.gap || '**UNPLANNED**'} |`
      )
    }
    L.push('', '## Lossy detail', '')
    for (const r of rows.filter((x) => !x.ok)) {
      L.push(
        `### ${r.name}`,
        '',
        r.err ? `error: ${r.err}` : '```markdown\n' + r.out.slice(0, 200) + '\n```',
        ''
      )
    }
    writeFileSync('spike/PHASE0-CREPE.md', L.join('\n'), 'utf8')
  })
})
