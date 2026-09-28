import { describe, it, expect, vi, afterEach } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, type Plugin } from '@milkdown/kit/prose/state'
import { history, undo } from '@milkdown/kit/prose/history'
import { historyClock } from './history-clock'

/**
 * Undo grouping when the system clock is set back.
 *
 * ProseMirror groups edits into undo steps by the time on each transaction,
 * which is the wall clock. Set back between two bursts of typing, as Windows
 * does when it corrects the time, the second burst looked as though it came
 * straight after the first, and one Ctrl+Z took both away.
 */

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
})

afterEach(() => vi.restoreAllMocks())

/** Types two bursts, the clock set back between them, and undoes once. */
function afterOneUndo(plugins: Plugin[], elapsed: () => number): string {
  let state = EditorState.create({ schema, plugins: [history(), ...plugins] })
  const type = (text: string) => {
    state = state.apply(state.tr.insertText(text))
  }
  const wall = vi.spyOn(Date, 'now')

  wall.mockReturnValue(1_000_000)
  type('first')
  // Two seconds pass, and the clock is set back ten.
  elapsed()
  wall.mockReturnValue(1_000_000 - 10_000)
  type(' second')

  undo(state, (tr) => {
    state = state.apply(tr)
  })
  return state.doc.textContent
}

describe('undo grouping', () => {
  it('keeps two bursts of typing apart when the clock is set back between them', () => {
    let now = 5_000
    const clock = () => now
    const text = afterOneUndo([historyClock(clock)], () => (now += 2_000))
    expect(text).toBe('first')
  })
})
