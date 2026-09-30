/**
 * The app's own right-click menu, for the file tree and the tabs.
 *
 * The native one (main's context-menu.ts) knows about text: spelling, cut,
 * copy and paste. What a click on a file or a tab should offer is the page's
 * business, so the page shows these itself, and cancelling the event keeps
 * the native one away.
 */
import { reactive } from 'vue'

export type ContextItem =
  | { label: string; run: () => unknown; disabled?: boolean }
  | { separator: true }

export const contextMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  items: [] as ContextItem[],
})

export function openContextMenu(e: MouseEvent, items: ContextItem[]): void {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.items = items
  contextMenu.open = true
}

export function closeContextMenu(): void {
  contextMenu.open = false
}
