/**
 * Undo grouping by the time that actually passed, not by the wall clock.
 *
 * ProseMirror groups edits into undo steps by the time stamped on each
 * transaction: typing within half a second of the last edit joins its step.
 * That time is `Date.now()`, which moves whenever the system clock is set. Set
 * back between two bursts of typing, as Windows does when it corrects the time,
 * the second burst looked as though it came straight after the first, and one
 * Ctrl+Z took both away. Measured in the WSL test runs, whose clock is corrected
 * often: stamps went back by up to eight seconds, and 5 undos in 40 removed two
 * bursts of typing.
 *
 * Each transaction is restamped from a clock that only moves forward, on the
 * wall clock's scale, before the history sees it.
 */
import { Plugin } from '@milkdown/kit/prose/state'

/** Milliseconds, on the wall clock's scale, that never go backwards. */
const steady = (): number => performance.timeOrigin + performance.now()

export function historyClock(now: () => number = steady): Plugin {
  return new Plugin({
    filterTransaction: (tr) => {
      tr.setTime(now())
      return true
    },
  })
}
