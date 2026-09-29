import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  type Settings,
  type SettingsPatch,
  type SettingsState,
} from '../../../shared/settings'

vi.mock('../editor/pool', () => ({ setCapacity: vi.fn() }))
vi.mock('../commands/registry', () => ({ invalidateCommands: vi.fn() }))

/**
 * Main as the renderer sees it: it applies each patch at once, but its reply
 * and its broadcast are delivered only when the test says so, in any order.
 * Electron gives no ordering between an invoke's reply and a `send`.
 */
function fakeMain() {
  let settings: Settings = structuredClone(DEFAULT_SETTINGS)
  let revision = 0
  const replies: Array<() => void> = []
  const broadcasts: Array<() => void> = []
  let listener: ((s: SettingsState) => void) | null = null
  const state = (): SettingsState => ({ ...structuredClone(settings), revision })

  const api = {
    get: async () => state(),
    patch: (patch: SettingsPatch) => {
      settings = applySettingsPatch(settings, structuredClone(patch))
      revision++
      const snap = state()
      broadcasts.push(() => listener?.(snap))
      return new Promise<SettingsState>((resolve) => replies.push(() => resolve(snap)))
    },
    onChanged: (fn: (s: SettingsState) => void) => {
      listener = fn
      return () => {}
    },
  }
  return {
    api,
    stored: () => settings,
    reply: async () => {
      replies.shift()?.()
      await Promise.resolve()
    },
    broadcast: () => broadcasts.shift()?.(),
  }
}

let main: ReturnType<typeof fakeMain>
let store: typeof import('./settings')

beforeEach(async () => {
  vi.resetModules()
  main = fakeMain()
  ;(window as unknown as { api: unknown }).api = { settings: main.api }
  store = await import('./settings')
  await store.initSettings()
})

describe('settings store', () => {
  it('keeps two quick changes to the same group', async () => {
    // Zoom, then a width change before main has answered the first. Each used
    // to send the whole editor group from this window's copy, and the second
    // copy predated the first change: the text size went back.
    const zoom = store.setFontSize(20)
    const width = store.setContentWidth(800)
    await main.reply()
    await main.reply()
    await Promise.all([zoom, width])

    expect(main.stored().editor.fontSize).toBe(20)
    expect(main.stored().editor.contentWidth).toBe(800)
    expect(store.useSettingsStore().value.editor.fontSize).toBe(20)
  })

  it('ignores a broadcast older than what it already shows', async () => {
    // A session write, then a Preferences change. The reply to the second can
    // arrive before the broadcast of the first, which carries the settings as
    // they were before the Preferences change.
    const session = store.patchSettings({ session: { active: 'a.md' } })
    const prefs = store.patchSettings({ editor: { sourceModeForceLines: 20000 } })
    await main.reply()
    await main.reply()
    await Promise.all([session, prefs])
    main.broadcast()

    expect(store.useSettingsStore().value.editor.sourceModeForceLines).toBe(20000)
    expect(store.useSettingsStore().value.session.active).toBe('a.md')
  })

  it('takes a newer broadcast from another window', async () => {
    const other = main.api.patch({ theme: 'night' })
    main.broadcast()
    void other

    expect(store.useSettingsStore().value.theme).toBe('night')
  })

  it('does not keep the revision among the settings', async () => {
    await Promise.all([store.patchSettings({ autoSave: true }), main.reply()])
    expect('revision' in store.useSettingsStore().value).toBe(false)
  })
})
