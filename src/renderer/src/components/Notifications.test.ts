import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import Notifications from './Notifications.vue'
import { dismiss, notes, notify } from '../stores/notifications'

/** Mounted, so what is asserted is what the page shows. */
let app: App | null = null
let host: HTMLElement

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(Notifications)
  app.mount(host)
})

afterEach(() => {
  for (const n of [...notes]) dismiss(n.id)
  app?.unmount()
  app = null
  host.remove()
  vi.useRealTimers()
})

const shown = () => [...host.querySelectorAll('.note__text')].map((e) => e.textContent)

describe('Notifications', () => {
  it('is a live region before any message arrives', () => {
    // One added with its first message is often not announced.
    expect(host.querySelector('[role="status"]')).not.toBeNull()
  })

  it('shows messages, and marks an error as an alert', async () => {
    notify('Saved')
    notify('Could not save', { kind: 'error' })
    await nextTick()
    expect(shown()).toEqual(['Saved', 'Could not save'])
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1)
  })

  it('runs an action from its button and takes the message away', async () => {
    const run = vi.fn()
    notify('Exported', { actions: [{ label: 'Open', run }] })
    await nextTick()
    const button = host.querySelector('.note__action') as HTMLButtonElement
    expect(button.textContent?.trim()).toBe('Open')
    button.click()
    await nextTick()
    expect(run).toHaveBeenCalledOnce()
    expect(shown()).toEqual([])
  })

  it('stays while the pointer is on it', async () => {
    notify('Saved')
    await nextTick()
    host.querySelector('.note')!.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(30_000)
    await nextTick()
    expect(shown()).toEqual(['Saved'])
    host.querySelector('.note')!.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(shown()).toEqual([])
  })

  it('is dismissed by its close button', async () => {
    notify('Saved')
    await nextTick()
    ;(host.querySelector('.note__close') as HTMLButtonElement).click()
    await nextTick()
    expect(shown()).toEqual([])
  })
})
