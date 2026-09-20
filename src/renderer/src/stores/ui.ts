/**
 * Transient UI state that is not worth persisting and does not belong to any
 * single component: overlays the shell owns but commands need to open.
 */
import { reactive } from 'vue'

export const quickOpen = reactive({ open: false })

export const commandPalette = reactive({ open: false })

export const preferences = reactive({ open: false })

/**
 * A transient message for the status bar.
 *
 * Export and print need to say where the file went, and a modal for a success
 * that the user expected would be an interruption rather than information.
 * Failures use the same surface, styled as a warning, and stay longer.
 */
export const notice = reactive({ text: '', kind: 'info' as 'info' | 'error' })

let noticeTimer: number | undefined

export function showNotice(text: string, kind: 'info' | 'error' = 'info'): void {
  notice.text = text
  notice.kind = kind
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.text = ''
  }, kind === 'error' ? 9000 : 4500)
}

/** Transient view toggles that are not worth persisting. */
export const uiState = reactive({ wordCountOpen: false })
