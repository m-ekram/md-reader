/**
 * The renderer's startup phases, as wall-clock times.
 *
 * The main process records its own (`src/main/startup.ts`); the bench reads
 * both and puts these on main's scale, so one launch reads as one timeline.
 */
type Marks = Record<string, number>
const g = globalThis as unknown as { __startupMarks?: Marks }
const marks: Marks = (g.__startupMarks ??= {})
// The page began loading: everything before it is Chromium starting the
// renderer process, everything after it is ours.
marks.navigationStart ??= performance.timeOrigin

/** Records the first time a phase is reached; later calls are ignored. */
export function mark(phase: string): void {
  if (marks[phase] === undefined) marks[phase] = performance.timeOrigin + performance.now()
}
