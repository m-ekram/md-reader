/**
 * Theme application.
 *
 * Built-in themes are bundled with the renderer and selected by flipping
 * `data-theme` on the root element, which is why switching is instant and needs
 * no reload. User themes are CSS read from disk and injected into a style tag.
 */
import { reactive } from 'vue'
import { invalidateCommands } from '../commands/registry'
import { resetMermaid } from '../editor/mermaid'

export interface ThemeInfo {
  id: string
  name: string
  builtin: boolean
}

/**
 * Built-in stylesheets, keyed by the id main reports.
 *
 * This is the one place a built-in theme has to be registered in the renderer:
 * the entry exists because the file is imported below it, so a theme cannot be
 * listed as available while having no stylesheet behind it.
 */
const BUILTIN_IDS = new Set(['claude-light', 'github', 'newsprint', 'night', 'pixyll', 'whitey'])

const state = reactive({
  available: [] as ThemeInfo[],
  current: 'github',
  isImplemented: (id: string) => BUILTIN_IDS.has(id),
})

export function useThemeStore() {
  return state
}

let userStyleEl: HTMLStyleElement | null = null

export async function applyTheme(id: string): Promise<void> {
  const info = state.available.find((t) => t.id === id)
  document.documentElement.setAttribute('data-theme', id)
  state.current = id

  if (info && !info.builtin) {
    const css = await window.api.themes.read(id)
    if (!userStyleEl) {
      userStyleEl = document.createElement('style')
      userStyleEl.id = 'user-theme'
      document.head.appendChild(userStyleEl)
    }
    userStyleEl.textContent = css
  } else if (userStyleEl) {
    userStyleEl.textContent = ''
  }
  // Mermaid bakes colours into the SVG it produces, so a theme change means
  // the cached diagrams and the initialized instance are both stale.
  resetMermaid()
  invalidateCommands()
}

export async function refreshThemes(): Promise<void> {
  state.available = await window.api.themes.list()
  invalidateCommands()
}

export async function initThemes(current: string): Promise<void> {
  await refreshThemes()
  window.api.themes.onChanged(() => void refreshThemes())
  await applyTheme(state.available.some((t) => t.id === current) ? current : 'github')
}
