/**
 * Transient UI state that is not worth persisting and does not belong to any
 * single component: overlays the shell owns but commands need to open.
 */
import { reactive } from 'vue'
import { notify } from './notifications'

export const quickOpen = reactive({ open: false })

export const commandPalette = reactive({ open: false })

export const preferences = reactive({ open: false })

/**
 * A brief message, such as where an export went.
 *
 * A modal for a success the user expected would be an interruption rather than
 * information. Failures use the same surface, styled as a warning, and stay
 * longer. `notify` (stores/notifications.ts) also takes actions.
 */
export function showNotice(text: string, kind: 'info' | 'error' = 'info'): void {
  if (text) notify(text, { kind })
}

/** Transient view toggles that are not worth persisting. */
export const uiState = reactive({ wordCountOpen: false })
