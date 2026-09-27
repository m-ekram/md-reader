/**
 * Typing latency in large documents: keystroke to the next painted frame.
 *
 *   node scripts/bench-typing.cjs [--lines 5000,10000] [--keys 40] [--repeat 3] [--gap 120]
 *                                 [--profile] [--detail <source>] [--callers <source>]
 *                                 [--no-build]
 *
 * Builds (with source maps when profiling), writes a realistic document of
 * each size — headings, prose, lists, quotes, code blocks, tables — launches
 * the app with it, puts the caret mid-document and types at a steady pace.
 * Each keystroke's latency is measured in the page, from keydown to the frame
 * after it. The large-file thresholds are raised for the bench's own profile,
 * so the formatted editor is what is measured, not source mode. Open time —
 * launch to the whole document on screen — is recorded too.
 *
 * Single runs on one machine have swung by a third, so each size is measured
 * --repeat times and the median of the runs is reported with their spread. A
 * change is only worth keeping if it moves the median by more than that.
 *
 * Profiling (first run of each size only):
 *   --profile            inclusive CPU per source file, through the source maps;
 *                        a file is credited once per sample wherever it appears
 *                        in the stack, so a plugin is charged for the document
 *                        walks it causes, not only for its own lines.
 *   --detail <source>    that source broken down by function.
 *   --callers <source>   who calls into that source: each sample inside it is
 *                        credited to the nearest calling frame from a different
 *                        source. For example `mdast-util-to-markdown` (who is
 *                        serialising) or `(getClientRects)` (who forces layout).
 */
/* global document, window, requestAnimationFrame */
const { _electron } = require('playwright')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const LINES = arg('--lines', '5000,10000').split(',').map(Number)
const KEYS = Number(arg('--keys', '40'))
const REPEAT = Number(arg('--repeat', '3'))
const DETAIL = arg('--detail', null)
const CALLERS = arg('--callers', null)
const PROFILE = process.argv.includes('--profile') || DETAIL !== null || CALLERS !== null
const BUILD = !process.argv.includes('--no-build')
// Time between keystrokes. 120 ms is a fast typist; 250 ms a relaxed one,
// whose pauses are what the editor's change reporting waits for.
const KEY_GAP_MS = Number(arg('--gap', '120'))

/** A document that looks like real notes, not one line repeated. */
function makeDocument(lines) {
  const out = []
  let n = 0
  while (out.length < lines) {
    n++
    out.push(`## Section ${n}`, '')
    out.push(
      `Paragraph ${n}: a sentence of ordinary prose with *emphasis*, **strong text**, \`code\` and a [link](https://example.com/${n}).`,
      ''
    )
    out.push(`- first point in section ${n}`, `- second point`, `  - a nested point`, '')
    out.push(`> A quoted line for section ${n}.`, '')
    if (n % 10 === 0) out.push('```js', `const section = ${n}`, 'console.log(section)', '```', '')
    if (n % 25 === 0) out.push('| a | b |', '| --- | --- |', `| ${n} | ${n * 2} |`, '')
    out.push(`Another paragraph closing section ${n}, long enough to wrap in a narrow column.`, '')
  }
  return out.slice(0, lines).join('\n') + '\nThe last line of the document.\n'
}

const sorted = (v) => [...v].sort((a, b) => a - b)
const median = (v) => sorted(v)[Math.floor(v.length / 2)]
const pct = (v, p) => sorted(v)[Math.min(v.length - 1, Math.floor(v.length * p))]
const ms = (n) => `${n.toFixed(1)} ms`

/** CPU attribution from a CDP profile, through the bundle's source maps. */
function attribute(profile, outDir) {
  const { SourceMapConsumer } = require('source-map-js')
  const consumers = new Map()
  const consumerFor = (url) => {
    const file = url.split('/').pop()
    if (!file || !file.endsWith('.js')) return null
    if (!consumers.has(file)) {
      let c = null
      try {
        c = new SourceMapConsumer(JSON.parse(readFileSync(join(outDir, `${file}.map`), 'utf8')))
      } catch {
        c = null
      }
      consumers.set(file, c)
    }
    return consumers.get(file)
  }

  const sourceOf = new Map()
  const labelOf = new Map()
  const parent = new Map()
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parent.set(child, node.id)
    const { url, lineNumber, columnNumber, functionName } = node.callFrame
    if (!url) {
      // Native work and the engine's own buckets: (program), (idle), a DOM call.
      const name = `(${functionName || 'program'})`
      sourceOf.set(node.id, name)
      labelOf.set(node.id, name)
      continue
    }
    const c = consumerFor(url)
    const pos = c ? c.originalPositionFor({ line: lineNumber + 1, column: columnNumber }) : null
    const source = pos?.source
      ? pos.source.replace(/^(\.\.\/)+/, '').replace(/^node_modules\//, '')
      : '(unmapped)'
    sourceOf.set(node.id, source)
    labelOf.set(node.id, `${source}:${pos?.line ?? '?'} ${pos?.name ?? functionName ?? ''}`.trim())
  }

  const total = new Map()
  const detail = new Map()
  const callers = new Map()
  const add = (map, key, dt) => map.set(key, (map.get(key) ?? 0) + dt)
  let all = 0
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] / 1000
    all += dt
    const seen = new Set()
    const seenDetail = new Set()
    // The caller is the parent of the *outermost* frame inside the source:
    // work like serialising recurses in and out of other libraries, and the
    // nearest outside frame would only name the recursion.
    let outermost = null
    for (let n = id; n !== undefined; n = parent.get(n)) {
      const source = sourceOf.get(n)
      seen.add(source)
      if (DETAIL && source.includes(DETAIL)) seenDetail.add(labelOf.get(n))
      if (CALLERS && source.includes(CALLERS)) outermost = n
    }
    const callerNode = outermost === null ? undefined : parent.get(outermost)
    const caller = callerNode === undefined ? null : labelOf.get(callerNode)
    for (const s of seen) add(total, s, dt)
    for (const s of seenDetail) add(detail, s, dt)
    if (caller) add(callers, caller, dt)
  })
  return { all, total, detail, callers }
}

async function measure(lines, profiling) {
  const work = mkdtempSync(join(tmpdir(), 'ekmd-typing-'))
  const userData = join(work, 'userdata')
  mkdirSync(userData, { recursive: true })
  // The formatted editor, not source mode, whatever the size.
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({ editor: { sourceModeOfferLines: 1e9, sourceModeForceLines: 1e9 } })
  )
  const file = join(work, `notes-${lines}.md`)
  writeFileSync(file, makeDocument(lines), 'utf8')

  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  const launched = Date.now()
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`, file], env })
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () =>
        document
          .querySelector('.ProseMirror')
          ?.textContent?.includes('The last line of the document.'),
      null,
      { timeout: 180_000, polling: 50 }
    )
    const openMs = Date.now() - launched

    // The caret at the end of a paragraph in the middle of the document.
    const target = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('.ProseMirror > p')]
      const p = ps[Math.floor(ps.length / 2)]
      p.scrollIntoView({ block: 'center' })
      return ps.indexOf(p)
    })
    await page.locator('.ProseMirror > p').nth(target).click()
    await page.keyboard.press('End')

    await page.evaluate(() => {
      window.__latency = []
      document.addEventListener(
        'keydown',
        () => {
          const t = performance.now()
          requestAnimationFrame(() =>
            setTimeout(() => window.__latency.push(performance.now() - t), 0)
          )
        },
        true
      )
    })

    let cdp = null
    if (profiling) {
      cdp = await page.context().newCDPSession(page)
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
      await cdp.send('Profiler.start')
    }
    const text = ' quick typing'.repeat(Math.ceil(KEYS / 13)).slice(0, KEYS)
    for (const ch of text) {
      await page.keyboard.type(ch)
      await page.waitForTimeout(KEY_GAP_MS)
    }
    await page.waitForTimeout(1000) // past the editor's pause, so its report is included
    const profile = cdp ? (await cdp.send('Profiler.stop')).profile : null
    const latency = await page.evaluate(() => window.__latency)
    return { openMs, latency, profile }
  } finally {
    await app.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
  }
}

function printProfile(profile, outDir) {
  const { all, total, detail, callers } = attribute(profile, outDir)
  const list = (title, map, n, filter = () => true) => {
    const rows = [...map.entries()]
      .filter(filter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
    if (rows.length === 0) return
    console.log(`         ${title}`)
    for (const [s, t] of rows) console.log(`         ${t.toFixed(0).padStart(7)} ms  ${s}`)
  }
  list(
    `inclusive CPU while typing (of ${all.toFixed(0)} ms sampled):`,
    total,
    18,
    ([s]) => !/^\((idle|root)\)$/.test(s)
  )
  list('of which the app’s own files:', total, 12, ([s]) => s.includes('src/renderer/'))
  if (DETAIL) list(`by function, in ${DETAIL}:`, detail, 12)
  if (CALLERS) list(`who calls into ${CALLERS}:`, callers, 15)
}

;(async () => {
  if (BUILD) {
    execFileSync('npx', ['electron-vite', 'build', ...(PROFILE ? ['--sourcemap'] : [])], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
  }
  const outDir = resolve('out/renderer/assets')
  for (const lines of LINES) {
    const runs = []
    for (let r = 0; r < REPEAT; r++) {
      const run = await measure(lines, PROFILE && r === 0)
      runs.push(run)
      console.log(
        `  ${String(lines).padStart(6)} lines, run ${r + 1}/${REPEAT}: median ${ms(median(run.latency))}` +
          `  p95 ${ms(pct(run.latency, 0.95))}  max ${ms(Math.max(...run.latency))}  open ${run.openMs} ms`
      )
      if (run.profile) printProfile(run.profile, outDir)
    }
    const medians = runs.map((r) => median(r.latency))
    const p95s = runs.map((r) => pct(r.latency, 0.95))
    const opens = runs.map((r) => r.openMs)
    const spread = (v) => `${Math.min(...v).toFixed(0)}–${Math.max(...v).toFixed(0)}`
    console.log(
      `${String(lines).padStart(6)} lines: keystroke to frame  median ${ms(median(medians))} (${spread(medians)})` +
        `   p95 ${ms(median(p95s))} (${spread(p95s)})   open ${median(opens)} ms (${spread(opens)})`
    )
  }
})()
