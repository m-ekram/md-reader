import { createApp } from 'vue'
import App from './App.vue'

import './themes/contract.css'
import './themes/github.css'
import './themes/night.css'
import './themes/claude-light.css'
import './themes/newsprint.css'
import './themes/pixyll.css'
import './themes/whitey.css'
import './themes/nord.css'
import './themes/one-dark.css'
import './themes/sepia.css'
import './themes/gruvbox-dark.css'
import '@milkdown/crepe/theme/common/style.css'
import './editor/editor.css'

import { initSettings, useSettingsStore } from './stores/settings'
import { mark } from './utils/startup'
import { initThemes } from './stores/theme'
import {
  registerAppCommands,
  registerRecentCommands,
  registerThemeCommands,
  watchGeneratedCommands,
} from './commands/app-commands'
import { registerEditorCommands } from './commands/editor-commands'
import { registerViewCommands } from './commands/view-commands'
import { registerSelectionCommands } from './commands/selection-commands'
import { registerExportCommands } from './commands/export-commands'
import { registerContentCommands } from './commands/content-commands'
import { registerHelpCommands } from './commands/help-commands'
import { registerUnavailableCommands } from './commands/unavailable-commands'
import { adoptFile, closeDoc, newDoc, useDocuments } from './stores/documents'
import { showNotice } from './stores/ui'
import { logError } from './utils/report'
import { initSearchListeners, initWorkspaceSync } from './stores/workspace'
import { initExternalChanges } from './stores/external-changes'
import { setEditorModes } from './editor/typewriter'
import { setPunctuation } from './editor/punctuation'
import { setShowWhitespace } from './editor/whitespace'

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

/**
 * Opens the files the window was launched with: a double-click in Explorer,
 * "Open with", or several files at once.
 *
 * Asked for, not waited for. App is mounted by now and listening for any that
 * arrive later, and main holds the ones that came before, so none is lost in
 * between. Returns whether any opened, so no blank document is made beside it.
 */
async function openStartupFiles(): Promise<boolean> {
  let openedAny = false
  for (const path of await window.api.file.takePendingPaths()) {
    try {
      adoptFile(await window.api.file.read(path))
      openedAny = true
    } catch (err) {
      showNotice(`Could not open ${path}: ${String(err)}`, 'error')
    }
  }
  return openedAny
}

async function boot(): Promise<void> {
  mark('bundleEvaluated')
  // Anything nothing else caught goes to main.log, not onto the screen:
  // libraries raise harmless ones (a resize observer's, for one) that would
  // only alarm. Failures of the user's own actions are shown by the command
  // runner.
  window.addEventListener('unhandledrejection', (e) => logError('unhandled rejection', e.reason))
  window.addEventListener('error', (e) => logError('uncaught error', e.error ?? e.message))
  await initSettings()
  const settings = useSettingsStore()

  await initThemes(settings.value.theme)

  setPunctuation({
    quotes: settings.value.editor.smartQuotes,
    dashes: settings.value.editor.smartDashes,
    ellipses: settings.value.editor.smartEllipses,
  })

  setShowWhitespace(settings.value.editor.showWhitespace)

  setEditorModes({
    focus: settings.value.editor.focusMode,
    typewriter: settings.value.editor.typewriter,
  })

  registerAppCommands()
  registerEditorCommands()
  registerViewCommands()
  registerSelectionCommands()
  registerExportCommands()
  registerContentCommands()
  registerHelpCommands()
  registerUnavailableCommands()
  registerThemeCommands()
  registerRecentCommands()
  watchGeneratedCommands()

  initSearchListeners()
  initExternalChanges()
  // Also reopens the last workspace, since settings already carry it.
  initWorkspaceSync()

  createApp(App).mount('#app')
  mark('mounted')

  // The window must be usable immediately, whatever the recovery prompt does:
  // the files it was opened with, or else a blank document.
  const opened = await openStartupFiles()
  const blank = opened ? null : newDoc()

  void offerRecoveries().then((restored) => {
    // Observable, so a test can tell "decided not to ask" from "not yet asked".
    mark('recoveryChecked')
    // Drop the placeholder if recovery supplied real documents and it was never
    // touched, so a restore does not leave a stray empty tab behind.
    if (!restored || !blank) return
    const docs = useDocuments()
    const i = docs.docs.indexOf(blank)
    if (i >= 0 && docs.docs.length > 1 && blank.content === '') closeDoc(i)
  })
}

void boot()
