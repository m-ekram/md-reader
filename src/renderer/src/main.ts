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
import { initSystemTheme } from './stores/system-theme'
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
import { adoptFile } from './stores/documents'
import { restoreSession, started, trackSession } from './stores/session'
import { showNotice } from './stores/ui'
import { logError } from './utils/report'
import { initSearchListeners, initWorkspaceSync } from './stores/workspace'
import { offerRecoveries } from './stores/recovery'
import { initExternalChanges } from './stores/external-changes'
import { setEditorModes } from './editor/typewriter'
import { setPunctuation } from './editor/punctuation'
import { setShowWhitespace } from './editor/whitespace'

/**
 * Opens the files the window was launched with: a double-click in Explorer,
 * "Open with", or several files at once.
 *
 * Asked for, not waited for. App is mounted by now and listening for any that
 * arrive later, and main holds the ones that came before, so none is lost in
 * between. Launched with none, the launch's first window reopens the last
 * session instead.
 */
async function openStartupFiles(): Promise<void> {
  const { paths, restoreSession: restore } = await window.api.file.takePendingPaths()
  for (const path of paths) {
    try {
      adoptFile(await window.api.file.read(path))
    } catch (err) {
      showNotice(`Could not open ${path}: ${String(err)}`, 'error')
    }
  }
  if (paths.length === 0 && restore) await restoreSession()
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

  await initThemes(await initSystemTheme())

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
  // the files it was opened with, the last session's, or the welcome screen.
  await openStartupFiles().catch((err) => logError('open startup files', err))
  // Only now: tracking before the restore would record the empty window
  // over the session it was about to reopen.
  trackSession()
  started.value = true

  // Observable, so a test can tell "decided not to ask" from "not yet asked".
  void offerRecoveries().finally(() => mark('recoveryChecked'))
}

void boot()
