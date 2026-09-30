#!/usr/bin/env node
/**
 * Runs the end-to-end suite on Windows, against the packaged app.
 *
 * Smart App Control blocks the unsigned development Electron on the machine
 * this project is built on, but not the packaged app, so the suite drives
 * dist\win-unpacked\ekram-md.exe instead (E2E_EXE, read by e2e/helpers.ts).
 * It builds first, as the other e2e scripts do, so it never tests a stale app.
 *
 *   npm run test:e2e:win                          # the whole suite
 *   npm run test:e2e:win -- e2e/find.test.ts      # one file
 *   npm run test:e2e:win -- -t "name of a test"   # one test
 *
 * Windows open and take the focus while it runs: leave the machine alone, or
 * the clipboard and focus tests can fail. Close a running copy of the app
 * first, or the build cannot replace it.
 */
const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const exe = join(root, 'dist', 'win-unpacked', 'ekram-md.exe')

execFileSync('npm', ['run', 'build:dir'], { cwd: root, stdio: 'inherit', shell: true })
if (!existsSync(exe)) {
  console.error(`The build left no ${exe}.`)
  process.exit(1)
}

const env = { ...process.env, E2E_EXE: exe }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(
  'npx',
  ['vitest', 'run', '--project', 'e2e', ...process.argv.slice(2).map((a) => JSON.stringify(a))],
  { cwd: root, stdio: 'inherit', shell: true, env }
)
process.exit(result.status ?? 1)
