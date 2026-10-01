<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Editor from './components/Editor.vue'
import StatusBar from './components/StatusBar.vue'
import TabBar from './components/TabBar.vue'
import Sidebar from './components/sidebar/Sidebar.vue'
import QuickOpen from './components/QuickOpen.vue'
import CommandPalette from './components/CommandPalette.vue'
import PreferencesDialog from './components/PreferencesDialog.vue'
import FindReplace from './components/FindReplace.vue'
import WordCountPopover from './components/WordCountPopover.vue'
import Notifications from './components/Notifications.vue'
import ContextMenu from './components/ContextMenu.vue'
import WikiSuggest from './components/WikiSuggest.vue'
import ReplacePreview from './components/ReplacePreview.vue'
import HistoryDialog from './components/HistoryDialog.vue'
import PageSetupDialog from './components/PageSetupDialog.vue'
import { commandPalette, preferences, quickOpen } from './stores/ui'
import { commandForAccel, isEnabled, isRegistered, run } from './commands/registry'
import { anyDirty, openPath, useDocuments, isDirty, journalKey } from './stores/documents'
import { saveActive } from './commands/app-commands'
import { flushAll } from './editor/pool'
import { stepFontSize } from './stores/settings'
import { installFileDrop } from './drop'
import { flushSession } from './stores/session'
import { autoSaveNow, installAutoSave } from './commands/autosave'
import { installUpdates } from './stores/updates'

const docs = useDocuments()
const unsubscribers: Array<() => void> = []

/**
 * Accelerators are handled here rather than in the main process. Routing every
 * keystroke through `before-input-event` would interfere with IME composition,
 * so the renderer owns the keymap.
 *
 * Only keys belonging to a command that actually exists are intercepted.
 * Claiming a key whose command is unimplemented swallows it without doing
 * anything, which is how copy, paste, undo and Tab all ended up dead: the menu
 * declared their accelerators long before the commands existed. Anything not
 * claimed here falls through to ProseMirror and CodeMirror, which implement
 * these natively.
 */
function onKeydown(e: KeyboardEvent): void {
  const id = commandForAccel(e)
  if (!id || !isRegistered(id) || !isEnabled(id)) return
  e.preventDefault()
  e.stopPropagation()
  void run(id)
}

/**
 * Ctrl+wheel changes the document's text size, as View ▸ Zoom does.
 *
 * Left alone, Chromium zooms the whole page, chrome included. Cancelling the
 * event needs a listener that is not passive. A touchpad sends many small
 * deltas where a mouse sends one per notch, so they are summed to a notch.
 */
let wheelDelta = 0
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return
  e.preventDefault()
  wheelDelta += e.deltaY
  if (Math.abs(wheelDelta) < 50) return
  const step = wheelDelta < 0 ? 1 : -1
  wheelDelta = 0
  void stepFontSize(step)
}

/** Lets the window go, once the files open in it are kept for next time. */
async function closeNow(): Promise<void> {
  await flushSession().catch(() => {})
  window.api.window.replyClose(true)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('wheel', onWheel, { passive: false })
  unsubscribers.push(installFileDrop())
  unsubscribers.push(installAutoSave())
  unsubscribers.push(installUpdates())

  unsubscribers.push(window.api.file.onOpenPath((path) => void openPath(path)))

  // Main asks before closing so unsaved work can be rescued first.
  unsubscribers.push(
    window.api.window.onCloseRequest(async () => {
      // Heard, at once: the answer below can wait on the user for as long as
      // they need, and main must not give up on it meanwhile.
      window.api.window.ackClose()
      // The dirty check reads the store, which lags the editor by a debounce:
      // quitting straight after typing closed without asking.
      flushAll()
      // With auto-save on, what it can save is saved rather than asked about.
      await autoSaveNow()
      if (!anyDirty()) {
        await closeNow()
        return
      }
      const names = docs.docs.filter(isDirty).map((d) => d.name)
      const choice = await window.api.file.confirmClose(names)
      if (choice === 'cancel') {
        window.api.window.replyClose(false)
        return
      }
      if (choice === 'discard') {
        // Discarded on purpose, as closing a tab with Don't Save already
        // does: otherwise the journals outlive the window and the work is
        // offered back as a "recovery" at the next launch.
        for (const d of docs.docs.filter(isDirty)) {
          await window.api.file.discardRecovery(journalKey(d))
        }
      }
      if (choice === 'save') {
        for (let i = 0; i < docs.docs.length; i++) {
          if (isDirty(docs.docs[i])) {
            docs.activeIndex = i
            if (!(await saveActive(false))) {
              window.api.window.replyClose(false)
              return
            }
          }
        }
      }
      await closeNow()
    })
  )
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('wheel', onWheel)
  for (const u of unsubscribers) u()
})
</script>

<template>
  <div class="app">
    <TitleBar />
    <main class="app__body">
      <Sidebar />
      <div class="app__doc">
        <TabBar />
        <!-- The overlays are placed against this pane, below the tab bar:
             against the whole area, the find bar covered the tabs. -->
        <div class="app__pane">
          <FindReplace />
          <Editor />
          <WordCountPopover />
          <Notifications />
        </div>
      </div>
    </main>
    <StatusBar />
    <QuickOpen :open="quickOpen.open" @close="quickOpen.open = false" />
    <CommandPalette :open="commandPalette.open" @close="commandPalette.open = false" />
    <PreferencesDialog :open="preferences.open" @close="preferences.open = false" />
    <ContextMenu />
    <WikiSuggest />
    <ReplacePreview />
    <HistoryDialog />
    <PageSetupDialog />
  </div>
</template>

<style>
/* The application's own font. The document sets its theme's (editor.css):
   inheriting that, menus, tabs and the status bar turned serif in the serif
   themes. */
:root {
  font-family: var(--ui-font);
}
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: var(--doc-bg);
  color: var(--doc-fg);
  overflow: hidden;
}
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app__doc {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.app__pane {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
::selection {
  background: var(--doc-selection);
}
</style>
