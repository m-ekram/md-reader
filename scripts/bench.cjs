/**
 * Startup, close and idle memory, reported as medians over several launches.
 *
 * Single samples on this machine spanned 648–1082 ms on an unchanged build — a
 * 40% spread, wide enough that a regression was once declared and then
 * withdrawn, both times on insufficient evidence. Anything claimed about
 * performance should come from here, and only compared with a run taken in the
 * same session.
 *
 * Launches use a private user-data folder. Without one the bench shared the
 * installed app's folder, so an open copy of ekram.md held the single-instance
 * lock and every launch quit at once — and when it did run, it measured the
 * user's own workspace and recent files rather than a clean start. The folder is
 * reused across runs on purpose: the first launch has nothing cached and is
 * reported on its own as `first`; the rest are the everyday case, `warm`.
 *
 *   node scripts/bench.cjs [runs]
 */
const { _electron } = require('playwright')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const RUNS = Number(process.argv[2] ?? 6)
const USER_DATA = mkdtempSync(join(tmpdir(), 'ekmd-bench-'))

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function summarize(label, values, unit) {
  const fixed = (n) => (unit === 'MB' ? n.toFixed(1) : Math.round(n))
  console.log(
    `${label.padEnd(20)} median ${fixed(median(values))}${unit}` +
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
  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${USER_DATA}`],
    cwd: process.cwd(),
    env,
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror', { timeout: 30_000 })
  const editableMs = Date.now() - started

  // Phases the app records about itself, in ms since its process started.
  const marks = await app.evaluate(() => globalThis.__startupMarks ?? {})

  // Let it settle before reading memory, or the number is mid-startup noise.
  await new Promise((r) => setTimeout(r, 3000))
  const idleRssMb = await app.evaluate(
    ({ app }) =>
      app.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0) / 1024
  )

  const closing = Date.now()
  await app.close()
  const closeMs = Date.now() - closing

  return { editableMs, idleRssMb, closeMs, marks }
}

;(async () => {
  console.log(`Running ${RUNS} launches (the first cold, the rest warm)...\n`)
  const runs = []

  try {
    for (let i = 0; i < RUNS; i++) {
      const r = await once()
      runs.push(r)
      const phases = Object.entries(r.marks)
        .map(([k, v]) => `${k} ${Math.round(v)}`)
        .join(', ')
      process.stdout.write(
        `  run ${i + 1}/${RUNS}: editable ${r.editableMs} ms, close ${r.closeMs} ms, ` +
          `${r.idleRssMb.toFixed(1)} MB${phases ? `   [${phases}]` : ''}\n`
      )
    }
  } finally {
    rmSync(USER_DATA, { recursive: true, force: true })
  }

  const warm = runs.slice(1)
  console.log('')
  console.log(`first launch         editable ${runs[0].editableMs} ms`)
  summarize('warm: editable', warm.map((r) => r.editableMs), 'ms')
  for (const phase of Object.keys(warm[0]?.marks ?? {})) {
    summarize(`warm: ${phase}`, warm.map((r) => r.marks[phase] ?? 0), 'ms')
  }
  summarize('close', runs.map((r) => r.closeMs), 'ms')
  summarize('idle RSS', runs.map((r) => r.idleRssMb), 'MB')

  // Budgets from the plan, checked against the median rather than a lucky run.
  const failures = []
  const editable = median(warm.map((r) => r.editableMs))
  if (editable > 1500) failures.push(`editable ${Math.round(editable)}ms exceeds 1500ms`)
  const rss = median(runs.map((r) => r.idleRssMb))
  if (rss > 400) failures.push(`idle RSS ${rss.toFixed(1)}MB exceeds 400MB`)

  if (failures.length > 0) {
    console.error('\nOVER BUDGET:\n  ' + failures.join('\n  '))
    process.exit(1)
  }
  console.log('\nWithin budget.')
})()
