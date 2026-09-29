/**
 * Settings mirror. Main owns the file; the renderer holds a reactive copy and
 * pushes patches through IPC. Main broadcasts changes back to every window, so
 * two open windows never disagree about the active theme.
 */
import { ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsPatch,
  type SettingsState,
} from '../../../shared/settings'
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
/** The revision of the settings showing; an older copy arriving late is ignored. */
let revision = -1

export function useSettingsStore() {
  return state
}

/** Takes settings from main unless a newer copy has already arrived. */
function accept(next: SettingsState): void {
  if (next.revision < revision) return
  const { revision: rev, ...settings } = next
  revision = rev
  state.value = settings
  setCapacity(settings.editor.liveEditors)
  applyAppearance(settings.editor)
  applyToolbar(settings.toolbar)
  invalidateCommands()
}

export async function initSettings(): Promise<void> {
  accept(await window.api.settings.get())
  window.api.settings.onChanged(accept)
}

/**
 * Changes the settings. Name only the fields that change: main applies them
 * over its own copy, so a field this window's copy has wrong is not written
 * back.
 */
export async function patchSettings(patch: SettingsPatch): Promise<void> {
  accept(await window.api.settings.patch(patch))
}

/** Stores a document text size; null returns to the theme's. */
export async function setFontSize(size: number | null): Promise<void> {
  await patchSettings({ editor: { fontSize: validFontSize(size) } })
}

/** One pixel larger or smaller than what is showing. View ▸ Zoom, Ctrl+wheel. */
export function stepFontSize(delta: number): Promise<void> {
  return setFontSize(steppedFontSize(state.value.editor, delta))
}

/** Stores a column width; null returns to the theme's. */
export async function setContentWidth(width: number | 'full' | null): Promise<void> {
  await patchSettings({ editor: { contentWidth: validWidth(width) } })
}
