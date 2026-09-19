import { describe, it, beforeAll, afterAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createRoundTripper, type RoundTripper } from './roundtrip'
import { fixtures } from './fixtures'

/**
 * Phase 0, question 2: how much of the round-trip gap is cosmetic (serializer
 * configuration) versus genuinely lossy (needs a schema node)?
 */
let plain: RoundTripper
let tuned: RoundTripper

beforeAll(async () => {
  plain = await createRoundTripper()
  tuned = await createRoundTripper({ conventional: true })
}, 60_000)

afterAll(() => {
  plain?.destroy()
  tuned?.destroy()
})

describe('default vs tuned serializer', () => {
  it('reports the split', () => {
    const rows = fixtures.map((f) => {
      const t = tuned.run(f.md)
      return {
        name: f.name,
        gap: f.expectedGap,
        before: plain.run(f.md).lossless,
        after: t.lossless,
        out: t.output,
      }
    })

    const fixed = rows.filter((r) => !r.before && r.after)
    const stillBroken = rows.filter((r) => !r.after)
    const L: string[] = []

    L.push('# Phase 0 - round-trip findings', '')
    L.push('Measured against Milkdown/Crepe 7.22.1 with the commonmark + gfm presets.', '')
    L.push(`- Lossless with Milkdown defaults: **${rows.filter((r) => r.before).length}/${rows.length}**`)
    L.push(`- Lossless with a tuned serializer: **${rows.filter((r) => r.after).length}/${rows.length}**`)
    L.push(`- Closed by serializer configuration alone: **${fixed.length}**`, '')
    L.push('## Per-construct', '', '| construct | default | tuned | note |', '|---|---|---|---|')
    for (const r of rows) {
      const note = !r.before && r.after ? 'fixed by config' : r.after ? '' : (r.gap ?? '**UNPLANNED**')
      L.push(`| ${r.name} | ${r.before ? 'ok' : 'lossy'} | ${r.after ? 'ok' : 'lossy'} | ${note} |`)
    }
    L.push('', '## Still lossy after tuning', '')
    for (const r of stillBroken) {
      L.push(`### ${r.name}`, '')
      L.push(r.gap ? `Planned mitigation: ${r.gap}` : '**Not yet accounted for in the plan.**', '')
      L.push('```markdown', r.out.slice(0, 200), '```', '')
    }
    writeFileSync('spike/PHASE0-REPORT.md', L.join('\n'), 'utf8')
  })
})
