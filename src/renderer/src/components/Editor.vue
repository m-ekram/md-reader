<script setup lang="ts">
/**
 * The editing surface.
 *
 * This is a host, not an owner: editors live in the pool so that switching tabs
 * does not throw away undo history. The host's job is to show the active
 * document's editor element and to run the round-trip guard the first time a
 * document is opened.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { acquire, release, releaseAll } from '../editor/pool'
import { checkRoundTrip } from '../editor/roundtrip'
import { activeDoc, journalKey, useDocuments, type Doc } from '../stores/documents'

const host = ref<HTMLElement | null>(null)
const docs = useDocuments()

/**
 * Acquiring is async, so two quick switches can interleave. Every attempt takes
 * a ticket and abandons its work if a newer one started while it was awaiting.
 */
let showToken = 0

async function show(): Promise<void> {
  const token = ++showToken
  const doc = activeDoc.value
  if (!host.value) return

  if (!doc) {
    host.value.replaceChildren()
    return
  }

  const pooled = await acquire({
    id: doc.id,
    getContent: () => doc.content,
    onChange: (markdown) => {
      // Route by the id this editor was built for, not the active document: a
      // pooled editor can emit after focus has already moved elsewhere.
      const target = docs.docs.find((d) => d.id === doc.id)
      if (!target) return
      target.content = markdown
      window.api.file.journal(journalKey(target), markdown)
    },
  })

  if (token !== showToken || !host.value) return

  // Adopting the element rather than re-rendering is what preserves the editor
  // state, including its undo stack and cursor position.
  if (host.value.firstChild !== pooled.el) host.value.replaceChildren(pooled.el)
  runGuard(doc, pooled.handle.reserialize)
}

/** Warns before editing when the file cannot be written back faithfully. */
function runGuard(doc: Doc, reserialize: (md: string) => string): void {
  if (doc.lossy !== null) return
  try {
    const report = checkRoundTrip(doc.savedContent, reserialize(doc.savedContent))
    doc.lossy = report.lossy ? { lossy: true, note: report.note } : { lossy: false, note: '' }
  } catch {
    doc.lossy = { lossy: true, note: 'This file could not be parsed cleanly.' }
  }
}

onMounted(show)
onBeforeUnmount(() => void releaseAll())

// Keyed on document identity, not path: Save As changes the path but is the
// same document, and reacting there would swap the editor out underneath the
// user at the moment they expect nothing to happen.
watch(() => activeDoc.value?.id, () => void show())

// A reload replaces the document's content wholesale. A pooled editor holds its
// own state and will not pick that up, so its editor is discarded and rebuilt.
watch(
  () => (activeDoc.value ? `${activeDoc.value.id}:${activeDoc.value.reloadToken}` : ''),
  async (next, prev) => {
    if (!next || !prev) return
    const [id, token] = next.split(':')
    const [prevId, prevToken] = prev.split(':')
    if (id !== prevId || token === prevToken) return
    await release(id)
    await show()
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
