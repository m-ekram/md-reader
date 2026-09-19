<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Editor from './components/Editor.vue'
import StatusBar from './components/StatusBar.vue'
import TabBar from './components/TabBar.vue'
import { commandForAccel, run } from './commands/registry'
import { adoptFile, anyDirty, useDocuments, isDirty } from './stores/documents'
import { saveActive } from './commands/app-commands'

const docs = useDocuments()
const unsubscribers: Array<() => void> = []

/**
 * Accelerators are handled here rather than in the main process. Routing every
 * keystroke through `before-input-event` would interfere with IME composition,
 * so the renderer owns the keymap and only genuinely unreachable keys would
 * need main's help.
 */
function onKeydown(e: KeyboardEvent): void {
  const id = commandForAccel(e)
  if (!id) return
  e.preventDefault()
  e.stopPropagation()
  void run(id)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)

  unsubscribers.push(
    window.api.file.onOpenPath(async (path) => adoptFile(await window.api.file.read(path)))
  )

  // Main asks before closing so unsaved work can be rescued first.
  unsubscribers.push(
    window.api.window.onCloseRequest(async () => {
      if (!anyDirty()) {
        window.api.window.replyClose(true)
        return
      }
      const names = docs.docs.filter(isDirty).map((d) => d.name)
      const choice = await window.api.file.confirmClose(names)
      if (choice === 'cancel') {
        window.api.window.replyClose(false)
        return
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
      window.api.window.replyClose(true)
    })
  )
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  for (const u of unsubscribers) u()
})
</script>

<template>
  <div class="app">
    <TitleBar />
    <TabBar />
    <main class="app__body">
      <Editor />
    </main>
    <StatusBar />
  </div>
</template>

<style>
:root {
  font-family: var(--doc-font);
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
::selection {
  background: var(--doc-selection);
}
</style>
