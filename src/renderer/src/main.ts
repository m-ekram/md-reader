import { createApp } from 'vue'
import App from './App.vue'

import './themes/contract.css'
import './themes/github.css'
import './themes/night.css'
import '@milkdown/crepe/theme/common/style.css'
import './editor/editor.css'

import { initSettings, useSettingsStore } from './stores/settings'
import { initThemes } from './stores/theme'
import {
  registerAppCommands,
  registerRecentCommands,
  registerThemeCommands,
  watchGeneratedCommands,
} from './commands/app-commands'
import { registerEditorCommands } from './commands/editor-commands'
import { adoptFile, closeDoc, newDoc, useDocuments } from './stores/documents'
import { initSearchListeners, initWorkspaceSync } from './stores/workspace'
import { initExternalChanges } from './stores/external-changes'

/**
 * Offers back anything a crash left behind, before the user starts typing.
 *
 * A journal key is either a real path or a synthetic `untitled:` id for a buffer
 * that was never saved, so the prompt describes both without showing the
 * synthetic key to the user.
 */
async function offerRecoveries(): Promise<boolean> {
  const pending = await window.api.file.pendingRecoveries()
  if (pending.length === 0) return false

  let restoredAny = false
  // Prompting happens after the window is usable, never as a gate in front of
  // it: a modal that appears before the first document exists leaves the app
  // looking hung if anything goes wrong answering it.
  for (const entry of pending) {
    const untitled = entry.path.startsWith('untitled:')
    const label = untitled ? 'An unsaved document' : entry.path

    const restore = await window.api.app.confirm(
      'Unsaved changes were recovered',
      `${label}\n\nRestore the recovered version?`
    )

    if (!restore) {
      await window.api.file.discardRecovery(entry.path)
      continue
    }

    const file = untitled ? null : await window.api.file.read(entry.path).catch(() => null)
    const doc = file ? adoptFile(file) : newDoc()
    doc.content = entry.content
    restoredAny = true
  }
  return restoredAny
}

async function boot(): Promise<void> {
  await initSettings()
  const settings = useSettingsStore()

  await initThemes(settings.value.theme)

  registerAppCommands()
  registerEditorCommands()
  registerThemeCommands()
  registerRecentCommands()
  watchGeneratedCommands()

  initSearchListeners()
  initExternalChanges()
  // Also reopens the last workspace, since settings already carry it.
  initWorkspaceSync()

  createApp(App).mount('#app')

  // The window must be usable immediately, whatever the recovery prompt does.
  const blank = newDoc()

  void offerRecoveries().then((restored) => {
    // Drop the placeholder if recovery supplied real documents and it was never
    // touched, so a restore does not leave a stray empty tab behind.
    if (!restored) return
    const docs = useDocuments()
    const i = docs.docs.indexOf(blank)
    if (i >= 0 && docs.docs.length > 1 && blank.content === '') closeDoc(i)
  })
}

void boot()
