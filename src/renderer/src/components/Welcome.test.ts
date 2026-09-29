import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import Welcome from './Welcome.vue'
import { register } from '../commands/registry'

let app: App | null = null
let host: HTMLElement
const ran: string[] = []

beforeEach(async () => {
  ran.length = 0
  for (const id of ['file.new', 'app.commandPalette', 'help.quickStart']) {
    register({ id, run: vi.fn(() => void ran.push(id)) })
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(Welcome)
  app.mount(host)
  await nextTick()
})

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

describe('Welcome', () => {
  it('points a newcomer at the command palette, the / menu and Quick Start', async () => {
    // A first launch showed New, Open and Open Folder and nothing about how
    // to find anything else.
    expect(host.textContent).toContain('Ctrl+Shift+P')
    expect(host.textContent).toContain('/')

    button('Find any command')!.click()
    button('Quick Start')!.click()
    await nextTick()
    expect(ran).toEqual(['app.commandPalette', 'help.quickStart'])
  })

  it('still puts New first, so Enter starts writing', () => {
    expect(document.activeElement?.textContent).toContain('New document')
  })
})
