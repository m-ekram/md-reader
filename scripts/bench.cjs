/**
 * Cold start and idle memory, reported as a median of several runs.
 *
 * Single samples on this machine spanned 648–1082 ms on an unchanged build — a
 * 40% spread, wide enough that a regression was once declared and then
 * withdrawn, both times on insufficient evidence. Anything claimed about
 * performance should come from here.
 *
 *   node scripts/bench.cjs [runs]
 */
const { _electron } = require('playwright')

const RUNS = Number(process.argv[2] ?? 5)

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function summarize(label, values, unit) {
  const fixed = (n) => (unit === 'MB' ? n.toFixed(1) : Math.round(n))
  console.log(
    `${label.padEnd(16)} median ${fixed(median(values))}${unit}` +
      `   min ${fixed(Math.min(...values))}   max ${fixed(Math.max(...values))}` +
      `   [${values.map(fixed).join(', ')}]`
  )
}

async function once() {
  // ELECTRON_RUN_AS_NODE is set in some shells and would boot Electron as
  // plain Node, with no app at all.
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }

  const started = Date.now()
  const app = await _electron.launch({ args: ['.'], cwd: process.cwd(), env })
  const page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror', { timeout: 30_000 })
  const coldStartMs = Date.now() - started

  // Let it settle before reading memory, or the number is mid-startup noise.
  await new Promise((r) => setTimeout(r, 4000))
  const idleRssMb = await app.evaluate(
    ({ app }) =>
      app.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0) / 1024
  )

  await app.close()
  return { coldStartMs, idleRssMb }
}

;(async () => {
  console.log(`Running ${RUNS} launches...\n`)
  const cold = []
  const rss = []

  for (let i = 0; i < RUNS; i++) {
    const r = await once()
    cold.push(r.coldStartMs)
    rss.push(r.idleRssMb)
    process.stdout.write(
      `  run ${i + 1}/${RUNS}: ${r.coldStartMs} ms, ${r.idleRssMb.toFixed(1)} MB\n`
    )
  }

  console.log('')
  summarize('cold start', cold, 'ms')
  summarize('idle RSS', rss, 'MB')

  // Budgets from the plan, checked against the median rather than a lucky run.
  const failures = []
  if (median(cold) > 1500) failures.push(`cold start ${Math.round(median(cold))}ms exceeds 1500ms`)
  if (median(rss) > 400) failures.push(`idle RSS ${median(rss).toFixed(1)}MB exceeds 400MB`)

  if (failures.length > 0) {
    console.error('\nOVER BUDGET:\n  ' + failures.join('\n  '))
    process.exit(1)
  }
  console.log('\nWithin budget.')
})()
