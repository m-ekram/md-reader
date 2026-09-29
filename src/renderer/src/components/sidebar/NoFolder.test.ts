import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import FileTreePanel from './FileTreePanel.vue'
import ArticlesPanel from './ArticlesPanel.vue'
import SearchPanel from './SearchPanel.vue'
import { register } from '../../commands/registry'

let app: App | null = null
let host: HTMLElement

async function mount(panel: Component): Promise<HTMLElement> {
  // Search cancels its search as it closes.
  ;(window as unknown as { api: unknown }).api = { search: { cancel: vi.fn(async () => {}) } }
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(panel)
  app.mount(host)
  await nextTick()
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

describe('folder panels with no folder open', () => {
  it.each([
    ['Files', FileTreePanel],
    ['Articles', ArticlesPanel],
    ['Search', SearchPanel],
  ])('%s offers to open one', async (_name, panel) => {
    // They said "No folder open" and left finding the command to the reader.
    const openFolder = vi.fn()
    register({ id: 'file.openFolder', run: openFolder })
    const el = await mount(panel as Component)

    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Open Folder')
    )
    button!.click()
    expect(openFolder).toHaveBeenCalledOnce()
  })

  it('does not take a search it has nowhere to run', async () => {
    const el = await mount(SearchPanel)
    expect((el.querySelector('.search__input') as HTMLInputElement).disabled).toBe(true)
  })
})
