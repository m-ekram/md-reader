<script setup lang="ts">
/** Open documents for this window. Hidden entirely when only one is open. */
import { closeDoc, isDirty, setActive, useDocuments } from '../stores/documents'

const docs = useDocuments()
</script>

<template>
  <nav v-if="docs.docs.length > 1" class="tabs" role="tablist" aria-label="Open documents">
    <button
      v-for="(d, i) in docs.docs"
      :key="i"
      class="tab"
      role="tab"
      :aria-selected="i === docs.activeIndex"
      :class="{ 'is-active': i === docs.activeIndex }"
      @click="setActive(i)"
      @auxclick.middle="closeDoc(i)"
    >
      <span class="tab__name">{{ d.name }}</span>
      <span v-if="isDirty(d)" class="tab__dot" aria-label="Unsaved changes">•</span>
      <span class="tab__close" role="button" aria-label="Close" @click.stop="closeDoc(i)">×</span>
    </button>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 1px;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-border);
  overflow-x: auto;
  flex: none;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: var(--chrome-fg-dim);
  font: inherit;
  font-size: 12px;
  cursor: default;
  white-space: nowrap;
}
.tab.is-active {
  background: var(--doc-bg);
  color: var(--doc-fg);
}
.tab:hover:not(.is-active) {
  background: var(--chrome-hover);
}
.tab__dot {
  color: var(--doc-accent);
}
.tab__close {
  opacity: 0.5;
}
.tab__close:hover {
  opacity: 1;
}
</style>
