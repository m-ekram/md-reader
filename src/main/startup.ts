/**
 * Startup phase timestamps, in ms since this process started.
 *
 * Kept on a global so the bench can read them with `app.evaluate`. Measuring
 * phases rather than one launch-to-editable number is what says *where* the
 * time goes: Chromium starting its processes is a fixed cost no code change
 * touches, and optimizing without that split means guessing.
 */
const marks: Record<string, number> = {}
;(globalThis as unknown as { __startupMarks: Record<string, number> }).__startupMarks = marks

/** Records the first time a phase is reached; later calls are ignored. */
export function mark(phase: string): void {
  if (marks[phase] === undefined) marks[phase] = process.uptime() * 1000
}
