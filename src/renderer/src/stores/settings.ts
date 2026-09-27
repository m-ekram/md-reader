/**
 * Settings mirror. Main owns the file; the renderer holds a reactive copy and
 * pushes patches through IPC. Main broadcasts changes back to every window, so
 * two open windows never disagree about the active theme.
 */
import { ref } from 'vue'
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/settings'
import { invalidateCommands } from '../commands/registry'
import { setCapacity } from '../editor/pool'
import {
  applyAppearance,
  applyToolbar,
  steppedFontSize,
  validFontSize,
  validWidth,
} from './appearance'

const state = ref<Settings>(structuredClone(DEFAULT_SETTINGS))

export function useSettingsStore() {
  return state
}

export async function initSettings(): Promise<void> {
  state.value = await window.api.settings.get()
  setCapacity(state.value.editor.liveEditors)
  applyAppearance(state.value.editor)
  applyToolbar(state.value.toolbar)
  window.api.settings.onChanged((s) => {
    state.value = s
    setCapacity(s.editor.liveEditors)
    applyAppearance(s.editor)
    applyToolbar(s.toolbar)
    invalidateCommands()
  })
}

export async function patchSettings(patch: Partial<Settings>): Promise<void> {
  state.value = await window.api.settings.patch(patch)
  applyAppearance(state.value.editor)
  applyToolbar(state.value.toolbar)
  invalidateCommands()
}

/** Stores a document text size; null returns to the theme's. */
export async function setFontSize(size: number | null): Promise<void> {
  await patchSettings({ editor: { ...state.value.editor, fontSize: validFontSize(size) } })
}

/** One pixel larger or smaller than what is showing. View ▸ Zoom, Ctrl+wheel. */
export function stepFontSize(delta: number): Promise<void> {
  return setFontSize(steppedFontSize(state.value.editor, delta))
}

/** Stores a column width; null returns to the theme's. */
export async function setContentWidth(width: number | 'full' | null): Promise<void> {
  await patchSettings({ editor: { ...state.value.editor, contentWidth: validWidth(width) } })
}
