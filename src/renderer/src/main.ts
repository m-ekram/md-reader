import { createApp } from 'vue'
import App from './App.vue'

import './themes/contract.css'
import './themes/github.css'
import './themes/night.css'
import '@milkdown/crepe/theme/common/style.css'
import './editor/editor.css'

import { initSettings, useSettingsStore } from './stores/settings'
import { initThemes } from './stores/theme'
import { registerAppCommands, registerRecentCommands, registerThemeCommands } from './commands/app-commands'
import { newDoc } from './stores/documents'

async function boot(): Promise<void> {
  await initSettings()
  const settings = useSettingsStore()

  await initThemes(settings.value.theme)

  registerAppCommands()
  registerThemeCommands()
  registerRecentCommands()

  createApp(App).mount('#app')

  // Offer to restore anything a crash left behind before the user starts typing.
  const pending = await window.api.file.pendingRecoveries()
  if (pending.length > 0) {
    for (const entry of pending) {
      const keep = window.confirm(
        `Unsaved changes were found for:\n\n${entry.path}\n\nRestore them?`
      )
      if (keep) {
        const f = await window.api.file.read(entry.path).catch(() => null)
        const { adoptFile } = await import('./stores/documents')
        const doc = f ? adoptFile(f) : newDoc()
        doc.content = entry.content
      } else {
        await window.api.file.discardRecovery(entry.path)
      }
    }
  } else {
    newDoc()
  }
}

void boot()
