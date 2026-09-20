/**
 * Transient UI state that is not worth persisting and does not belong to any
 * single component: overlays the shell owns but commands need to open.
 */
import { reactive } from 'vue'

export const quickOpen = reactive({ open: false })
