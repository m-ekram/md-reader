<script setup lang="ts">
/** Open documents for this window. Hidden entirely when only one is open. */
import { isDirty, setActive, useDocuments } from '../stores/documents'
// Not the store's closeDoc, which removes a document without asking: this is
// the prompting path, the same one Ctrl+W takes.
import { requestClose } from '../commands/app-commands'

const docs = useDocuments()
</script>

<template>
  <nav v-if="docs.docs.length > 1" class="tabs" role="tablist" aria-label="Open documents">
    <div
      v-for="(d, i) in docs.docs"
      :key="d.id"
      class="tab"
      :class="{ 'is-active': i === docs.activeIndex }"
    >
      <button
        class="tab__select"
        role="tab"
        :aria-selected="i === docs.activeIndex"
        @click="setActive(i)"
        @auxclick.middle="requestClose(i)"
      >
        <span class="tab__name">{{ d.name }}</span>
        <span v-if="isDirty(d)" class="tab__dot" aria-label="Unsaved changes">•</span>
      </button>
      <button class="tab__close" :aria-label="`Close ${d.name}`" @click.stop="requestClose(i)">
        ×
      </button>
    </div>
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
  background: transparent;
  color: var(--chrome-fg-dim);
  font-size: 12px;
  white-space: nowrap;
}
.tab__select,
.tab__close {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: default;
}
.tab__select {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px 6px 10px;
}
.tab__close {
  padding: 6px 8px 6px 4px;
}
.tab__select:focus-visible,
.tab__close:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
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
