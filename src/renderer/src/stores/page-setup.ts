/**
 * The page setup asked for before each Export PDF, filled in with the last
 * choice. Every PDF was A4 portrait, with no page numbers and no way to ask.
 */
import { reactive } from 'vue'
import { validPageSetup, type PageSetup } from '../../../shared/page-setup'
import { useSettingsStore } from './settings'

export const pageSetupState = reactive({
  open: false,
  setup: validPageSetup(undefined),
})

let answer: ((setup: PageSetup | null) => void) | null = null

/** The page setup the user chooses, or null when they cancel. */
export function askPageSetup(): Promise<PageSetup | null> {
  answer?.(null)
  pageSetupState.setup = validPageSetup(useSettingsStore().value.pdf)
  pageSetupState.open = true
  return new Promise((resolve) => (answer = resolve))
}

export function answerPageSetup(ok: boolean): void {
  pageSetupState.open = false
  const resolve = answer
  answer = null
  resolve?.(ok ? { ...pageSetupState.setup } : null)
}
