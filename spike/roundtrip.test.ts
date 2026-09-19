import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRoundTripper, type RoundTripper } from './roundtrip'
import { fixtures } from './fixtures'

let rt: RoundTripper

beforeAll(async () => {
  rt = await createRoundTripper({ conventional: true })
}, 30_000)

afterAll(() => rt?.destroy())

describe('markdown round-trip fidelity', () => {
  const results: Array<{ name: string; ok: boolean; gap?: string; detail: string }> = []

  for (const f of fixtures) {
    it(f.name, () => {
      const r = rt.run(f.md)
      results.push({
        name: f.name,
        ok: r.lossless,
        gap: f.expectedGap,
        detail: r.error ?? (r.lossless ? '' : `line ${r.firstDiffLine}: ${JSON.stringify(r.output.slice(0, 90))}`),
      })
      // Fixtures with a known gap are reported, not enforced, until their phase lands.
      if (!f.expectedGap) expect(r.lossless, `\n--- in ---\n${f.md}\n--- out ---\n${r.output}\n`).toBe(true)
    })
  }

  afterAll(() => {
    const clean = results.filter((r) => r.ok).length
    console.log('\n╔══ PHASE 0 ROUND-TRIP REPORT ' + '═'.repeat(50))
    for (const r of results) {
      const mark = r.ok ? 'PASS' : r.gap ? 'GAP ' : 'FAIL'
      console.log(`║ ${mark}  ${r.name.padEnd(34)} ${r.gap ? '(' + r.gap + ') ' : ''}${r.detail}`)
    }
    console.log(`╚══ ${clean}/${results.length} lossless with commonmark+gfm alone`)
  })
})
