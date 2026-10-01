import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notes } from './notifications'
import { showUpdate } from './updates'

/** Each step of an update is a notice whose actions are the only way on. */

const api = {
  download: vi.fn(async () => {}),
  restart: vi.fn(),
  openRelease: vi.fn(),
}

beforeEach(() => {
  notes.splice(0)
  for (const f of Object.values(api)) f.mockClear()
  ;(window as unknown as { api: { updates: typeof api } }).api = { updates: api }
})

const shown = () => notes.map((n) => ({ text: n.text, actions: n.actions.map((a) => a.label) }))
const press = (label: string) => notes[0].actions.find((a) => a.label === label)!.run()

describe('update notices', () => {
  it('offer a newer version, and download it only when asked', async () => {
    showUpdate({ kind: 'available', version: '1.1.0', installable: true })
    expect(shown()).toEqual([
      { text: 'ekram.md 1.1.0 is available.', actions: ['Download', 'What’s new'] },
    ])
    expect(api.download).not.toHaveBeenCalled()

    await press('Download')
    expect(api.download).toHaveBeenCalledOnce()
    // The same notice, now saying what is happening.
    expect(shown()).toEqual([{ text: 'Downloading ekram.md 1.1.0…', actions: [] }])
  })

  it('send the portable copy to the release page', () => {
    showUpdate({ kind: 'available', version: '1.1.0', installable: false })
    expect(shown()[0].actions).toEqual(['Download page'])
    press('Download page')
    expect(api.openRelease).toHaveBeenCalledOnce()
    expect(api.download).not.toHaveBeenCalled()
  })

  it('restart only when Restart now is pressed', () => {
    showUpdate({ kind: 'ready', version: '1.1.0' })
    expect(shown()).toEqual([
      {
        text: 'ekram.md 1.1.0 is ready, and is installed when you quit.',
        actions: ['Restart now'],
      },
    ])
    expect(api.restart).not.toHaveBeenCalled()
    press('Restart now')
    expect(api.restart).toHaveBeenCalledOnce()
  })

  it('answer a check that found nothing, or failed', () => {
    showUpdate({ kind: 'none', version: '1.0.0' })
    expect(shown()).toEqual([{ text: 'ekram.md 1.0.0 is the latest version.', actions: [] }])
    showUpdate({ kind: 'error', message: 'Could not reach the update server.' })
    expect(notes.map((n) => [n.text, n.kind])).toEqual([
      ['Could not reach the update server.', 'error'],
    ])
  })
})
