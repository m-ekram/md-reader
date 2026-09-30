import { execFileSync } from 'node:child_process'

/**
 * Builds before the end-to-end suite runs.
 *
 * These tests launch the packaged output in `out/`, not the sources, so running
 * vitest directly would silently test a stale build — which is exactly what
 * happened once, producing six confusing failures against code that was
 * already correct.
 */
export default function setup(): void {
  // A packaged build under test was built from out/ just before; see win-e2e.cjs.
  if (process.env.E2E_EXE) return
  execFileSync('npx', ['electron-vite', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}
