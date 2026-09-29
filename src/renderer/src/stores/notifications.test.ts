import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismiss, notes, notify, pause, resume, runAction } from './notifications'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const n of [...notes]) dismiss(n.id)
  vi.useRealTimers()
})

const texts = () => notes.map((n) => n.text)

describe('notifications', () => {
  it('shows a message and takes it away after a while', () => {
    notify('Saved')
    expect(texts()).toEqual(['Saved'])
    vi.advanceTimersByTime(4499)
    expect(texts()).toEqual(['Saved'])
    vi.advanceTimersByTime(1)
    expect(texts()).toEqual([])
  })

  it('keeps an error up longer', () => {
    notify('Could not save', { kind: 'error' })
    vi.advanceTimersByTime(8000)
    expect(texts()).toEqual(['Could not save'])
    vi.advanceTimersByTime(1000)
    expect(texts()).toEqual([])
  })

  it('stacks messages, keeping the three most recent', () => {
    // A single slot showed only the last: a failure could be replaced by an
    // unrelated success before it was read.
    for (const t of ['one', 'two', 'three', 'four']) notify(t)
    expect(texts()).toEqual(['two', 'three', 'four'])
  })

  it('replaces a message with the same key in place', () => {
    notify('first')
    notify('Exporting…', { key: 'export' })
    notify('second')
    notify('Export complete', { key: 'export' })
    expect(texts()).toEqual(['first', 'Export complete', 'second'])
  })

  it('keeps a message up while the pointer rests on it', () => {
    const id = notify('Saved')
    vi.advanceTimersByTime(4000)
    pause(id)
    vi.advanceTimersByTime(60_000)
    expect(texts()).toEqual(['Saved'])
    resume(id)
    // The time it had left, not the full time again.
    vi.advanceTimersByTime(499)
    expect(texts()).toEqual(['Saved'])
    vi.advanceTimersByTime(1)
    expect(texts()).toEqual([])
  })

  it('leaves a message with no timeout until it is dismissed', () => {
    const id = notify('Exporting…', { timeoutMs: 0 })
    vi.advanceTimersByTime(600_000)
    expect(texts()).toEqual(['Exporting…'])
    dismiss(id)
    expect(texts()).toEqual([])
  })

  it('runs an action and then dismisses its message', async () => {
    const run = vi.fn()
    const id = notify('Exported', { actions: [{ label: 'Open', run }] })
    await runAction(id, 0)
    expect(run).toHaveBeenCalledOnce()
    expect(texts()).toEqual([])
  })

  it('gives a message with actions time to reach them', () => {
    notify('Exported', { actions: [{ label: 'Open', run: () => {} }] })
    vi.advanceTimersByTime(8000)
    expect(texts()).toEqual(['Exported'])
  })
})
