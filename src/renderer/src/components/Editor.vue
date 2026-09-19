<script setup lang="ts">
/**
 * The editing surface.
 *
 * Mounts one editor per document and runs the round-trip guard on open, so a
 * file we cannot faithfully write back is flagged before it is edited rather
 * than after it is saved.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createEditor, type EditorHandle } from '../editor/crepe'
import { checkRoundTrip } from '../editor/roundtrip'
import { activeDoc, useDocuments } from '../stores/documents'
import { useSettingsStore } from '../stores/settings'

const host = ref<HTMLElement | null>(null)
const docs = useDocuments()
const settings = useSettingsStore()
let handle: EditorHandle | null = null
/** Guards against writing the editor's own emitted content back into it. */
let mountedPath: string | null | undefined

async function mount(): Promise<void> {
  const doc = activeDoc.value
  if (!host.value) return

  await handle?.destroy()
  handle = null
  host.value.innerHTML = ''
  if (!doc) return

  const forceSource = doc.content.split('\n').length > settings.value.editor.sourceModeForceLines

  handle = await createEditor({
    root: host.value,
    value: doc.content,
    readonly: forceSource,
    onChange: (markdown) => {
      const d = activeDoc.value
      if (!d || d.path !== mountedPath) return
      d.content = markdown
      if (d.path) window.api.file.journal(d.path, markdown)
    },
  })
  mountedPath = doc.path

  // Run the guard once, against the content as it came off disk.
  if (doc.lossy === null) {
    try {
      const report = checkRoundTrip(doc.savedContent, handle.reserialize(doc.savedContent))
      doc.lossy = report.lossy ? { lossy: true, note: report.note } : { lossy: false, note: '' }
    } catch {
      doc.lossy = { lossy: true, note: 'This file could not be parsed cleanly.' }
    }
  }
}

onMounted(mount)
onBeforeUnmount(() => void handle?.destroy())

// Remount when the active document changes, but not on every keystroke.
watch(
  () => [docs.activeIndex, activeDoc.value?.path] as const,
  () => void mount()
)
</script>

<template>
  <div class="editor-scroll">
    <div v-if="!activeDoc" class="empty">
      <p>No document open</p>
      <p class="empty__hint">Ctrl+N for a new file, Ctrl+O to open one</p>
    </div>
    <div v-show="activeDoc" ref="host" class="editor-host" />
  </div>
</template>

<style scoped>
.editor-scroll {
  flex: 1;
  overflow: auto;
  background: var(--doc-bg);
  color: var(--doc-fg);
}
.editor-host {
  max-width: var(--doc-measure);
  margin: 0 auto;
  padding: 40px 32px 55vh;
}
.empty {
  height: 100%;
  display: grid;
  place-content: center;
  text-align: center;
  color: var(--doc-muted);
}
.empty__hint {
  font-size: 13px;
  margin-top: 4px;
}
</style>
