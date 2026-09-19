/**
 * Settings mirror. Main owns the file; the renderer holds a reactive copy and
 * pushes patches through IPC. Main broadcasts changes back to every window, so
 * two open windows never disagree about the active theme.
 */
import { ref } from 'vue'
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/settings'
import { invalidateCommands } from '../commands/registry'

const state = ref<Settings>(structuredClone(DEFAULT_SETTINGS))

export function useSettingsStore() {
  return state
}

export async function initSettings(): Promise<void> {
  state.value = await window.api.settings.get()
  window.api.settings.onChanged((s) => {
    state.value = s
    invalidateCommands()
  })
}

export async function patchSettings(patch: Partial<Settings>): Promise<void> {
  state.value = await window.api.settings.patch(patch)
  invalidateCommands()
}
