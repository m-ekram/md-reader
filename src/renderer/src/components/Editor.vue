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
import { activeDoc, journalKey, useDocuments, type Doc } from '../stores/documents'

const host = ref<HTMLElement | null>(null)
const docs = useDocuments()
let handle: EditorHandle | null = null

/**
 * Mounting is async, so two quick document switches can interleave and leave the
 * older editor as the surviving one. Every mount takes a ticket and abandons its
 * work if a newer mount started while it was awaiting.
 */
let mountToken = 0
/** The document this editor is currently showing, for routing change events. */
let mountedId: string | null = null

async function mount(): Promise<void> {
  const token = ++mountToken
  const doc = activeDoc.value
  if (!host.value) return

  await handle?.destroy()
  if (token !== mountToken) return

  handle = null
  mountedId = null
  host.value.innerHTML = ''
  if (!doc) return

  const created = await createEditor({
    root: host.value,
    value: doc.content,
    onChange: (markdown) => {
      // Route by identity: two untitled documents both have a null path, so
      // comparing paths would let one document's edits land in the other.
      const d = activeDoc.value
      if (!d || d.id !== mountedId) return
      d.content = markdown
      window.api.file.journal(journalKey(d), markdown)
    },
  })

  if (token !== mountToken) {
    // A newer mount won while this one was being built; discard this editor.
    await created.destroy()
    return
  }

  handle = created
  mountedId = doc.id
  runGuard(doc)
}

/** Warns before editing when the file cannot be written back faithfully. */
function runGuard(doc: Doc): void {
  if (doc.lossy !== null || !handle) return
  try {
    const report = checkRoundTrip(doc.savedContent, handle.reserialize(doc.savedContent))
    doc.lossy = report.lossy ? { lossy: true, note: report.note } : { lossy: false, note: '' }
  } catch {
    doc.lossy = { lossy: true, note: 'This file could not be parsed cleanly.' }
  }
}

onMounted(mount)
onBeforeUnmount(() => void handle?.destroy())

// Keyed on document identity, not path: a Save As changes the path but is the
// same document, and remounting there would throw away the cursor and undo
// history at the exact moment the user expects nothing to happen.
watch(
  () => [docs.activeIndex, activeDoc.value?.id] as const,
  (next, prev) => {
    if (prev && next[1] === prev[1] && next[0] === prev[0]) return
    void mount()
  }
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
