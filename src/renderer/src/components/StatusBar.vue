<script setup lang="ts">
/**
 * Status bar. Beyond counts, this is where the round-trip warning surfaces —
 * visible but non-blocking, so the user learns a file is risky before they
 * commit to editing it, without a modal interrupting them.
 */
import { computed } from 'vue'
import { activeDoc, isDirty } from '../stores/documents'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const counts = computed(() => {
  const text = activeDoc.value?.content ?? ''
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return { words, chars: text.length, lines: text ? text.split('\n').length : 0 }
})

const large = computed(() => {
  const d = activeDoc.value
  if (!d) return false
  return counts.value.lines > settings.value.editor.sourceModeOfferLines
})
</script>

<template>
  <footer v-if="settings.statusBar" class="status">
    <div class="status__left">
      <span v-if="activeDoc?.lossy?.lossy" class="warn" :title="activeDoc.lossy.note">
        ⚠ {{ activeDoc.lossy.note }}
      </span>
      <span v-else-if="large" class="warn">
        ⚠ Large document — editing may feel slow
      </span>
    </div>

    <div class="status__right">
      <span v-if="activeDoc">{{ counts.words }} words</span>
      <span v-if="activeDoc">{{ counts.chars }} chars</span>
      <span v-if="activeDoc">{{ counts.lines }} lines</span>
      <span v-if="activeDoc">{{ activeDoc.eol === '\r\n' ? 'CRLF' : 'LF' }}</span>
      <span v-if="activeDoc">{{ activeDoc.encoding.toUpperCase() }}{{ activeDoc.hasBom ? ' BOM' : '' }}</span>
      <span v-if="activeDoc && isDirty(activeDoc)" class="dirty">Unsaved</span>
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
.warn {
  color: var(--warning);
}
.dirty {
  color: var(--doc-accent);
}
</style>
