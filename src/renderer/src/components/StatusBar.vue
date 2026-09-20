<script setup lang="ts">
/**
 * Status bar. Beyond counts, this is where the round-trip warning surfaces —
 * visible but non-blocking, so the user learns a file is risky before they
 * commit to editing it, without a modal interrupting them.
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { activeDoc, isDirty } from '../stores/documents'
import { useSettingsStore } from '../stores/settings'
import { notice } from '../stores/ui'

const settings = useSettingsStore()

/**
 * Counting words means walking the whole document. Doing that synchronously on
 * every keystroke puts an O(document) cost on the typing path, which is exactly
 * where the measurements say we have the least headroom. Trailing debounce.
 */
const counts = ref({ words: 0, chars: 0, lines: 0 })
let timer: number | undefined

function recount(text: string): void {
  counts.value = {
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    chars: text.length,
    lines: text ? text.split('\n').length : 0,
  }
}

watch(
  () => activeDoc.value?.content ?? '',
  (text) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => recount(text), 200)
  },
  { immediate: true }
)

onBeforeUnmount(() => window.clearTimeout(timer))

const large = computed(() => {
  if (!activeDoc.value) return false
  return counts.value.lines > settings.value.editor.sourceModeOfferLines
})

const eolLabel = computed(() => (activeDoc.value?.eol === '\r\n' ? 'CRLF' : 'LF'))
</script>

<template>
  <footer v-if="settings.statusBar" class="status">
    <div class="status__left">
      <span v-if="notice.text" class="notice" :class="{ warn: notice.kind === 'error' }">
        {{ notice.text }}
      </span>
      <span v-else-if="activeDoc?.lossy?.lossy" class="warn" :title="activeDoc.lossy.note">
        ⚠ {{ activeDoc.lossy.note }}
      </span>
      <span v-else-if="large" class="warn">
        ⚠ {{ counts.lines.toLocaleString() }} lines — typing may lag in this document
      </span>
    </div>

    <div class="status__right">
      <template v-if="activeDoc">
        <span>{{ counts.words }} words</span>
        <span>{{ counts.chars }} chars</span>
        <span>{{ counts.lines }} lines</span>
        <span>{{ eolLabel }}</span>
        <span>{{ activeDoc.encoding.toUpperCase() }}{{ activeDoc.hasBom ? ' BOM' : '' }}</span>
        <span v-if="isDirty(activeDoc)" class="dirty">Unsaved</span>
      </template>
    </div>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  height: 24px;
  padding: 0 12px;
  align-items: center;
  background: var(--status-bg);
  color: var(--status-fg);
  border-top: 1px solid var(--doc-rule);
  font-size: 12px;
  flex: none;
}
.status__right {
  display: flex;
  gap: 14px;
}
.status__left {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice {
  color: var(--doc-accent);
}
.warn {
  color: var(--warning);
}
.dirty {
  color: var(--doc-accent);
}
</style>
