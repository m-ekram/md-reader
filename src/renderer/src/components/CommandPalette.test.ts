import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import CommandPalette from './CommandPalette.vue'
import { register } from '../commands/registry'
import { useThemeStore } from '../stores/theme'
import { useSettingsStore } from '../stores/settings'

/**
 * Mounted directly rather than driven through the end-to-end suite.
 *
 * The bug this guards — a row claiming the selection when the palette opened
 * under a resting cursor — reproduced end to end only when an earlier test
 * happened to leave the pointer in the right place. That is not a guard; it is
 * a coincidence that failed once. Here the event is dispatched deliberately,
 * so the assertion means the same thing on every run.
 */
let app: App | null = null
let host: HTMLElement

function mount(): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(CommandPalette, { open: true, onClose: () => {} })
  app.mount(host)
  return host
}

beforeEach(async () => {
  // Real commands, addressed by ids the menu already declares, so the palette
  // has something to list.
  register({ id: 'para.quote', run: vi.fn() })
  register({ id: 'edit.smartQuotes', run: vi.fn() })
  mount()
  await nextTick()
})

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

async function search(text: string): Promise<void> {
  const input = host.querySelector('input') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input'))
  await nextTick()
  await nextTick()
}

const rows = (): HTMLElement[] => Array.from(host.querySelectorAll('.palette__item'))
const selectedIndex = (): number => rows().findIndex((r) => r.classList.contains('is-selected'))

describe('CommandPalette selection', () => {
  it('starts on the first result', async () => {
    await search('quote')
    expect(rows().length).toBeGreaterThan(1)
    expect(selectedIndex()).toBe(0)
  })

  it('ignores a pointer that has not moved', async () => {
    await search('quote')
    expect(selectedIndex()).toBe(0)

    // What the browser fires when an element appears beneath a stationary
    // cursor. Acting on it moved the selection off the first result, so Enter
    // ran a command the user had never looked at.
    rows()[1].dispatchEvent(new Event('pointerenter', { bubbles: true }))
    await nextTick()

    expect(selectedIndex(), 'a stationary pointer must not steal the selection').toBe(0)
  })

  it('follows the pointer when it actually moves', async () => {
    await search('quote')

    rows()[1].dispatchEvent(new Event('pointermove', { bubbles: true }))
    await nextTick()

    // The other half of the trade: hovering must still work.
    expect(selectedIndex()).toBe(1)
  })

  it('returns to the top when the query changes', async () => {
    await search('quote')
    rows()[1].dispatchEvent(new Event('pointermove', { bubbles: true }))
    await nextTick()
    expect(selectedIndex()).toBe(1)

    await search('quo')
    expect(selectedIndex(), 'a new result set starts at the top').toBe(0)
  })

  it('moves with the arrow keys', async () => {
    await search('quote')
    const input = host.querySelector('input') as HTMLInputElement

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(selectedIndex()).toBe(1)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await nextTick()
    expect(selectedIndex()).toBe(0)
  })
})

describe('CommandPalette reach', () => {
  it('finds a theme and a recent file by name', async () => {
    // Built from the fixed menu specification, it skipped the generated parts
    // of the menus: no theme and no recent file could be found by name.
    useThemeStore().available = [{ id: 'nord', name: 'Nord', builtin: true }]
    useSettingsStore().value.recentFiles = ['C:\notes\holiday-plan.md']
    register({ id: 'theme.nord', run: vi.fn() })
    register({ id: 'file.recent.0', run: vi.fn() })

    await search('nord')
    expect(rows().map((r) => r.textContent)).toContainEqual(expect.stringContaining('Nord'))

    await search('holiday')
    expect(rows()[0]?.textContent).toContain('holiday-plan.md')
    expect(rows()[0]?.textContent).toContain('Open Recent')
  })
})
