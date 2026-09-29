<script setup lang="ts">
/**
 * Open documents for this window. Hidden entirely when only one is open.
 *
 * Tabs are compact: each is capped in width and shrinks as more open, with the
 * name ellipsized and given in full, with its folder, in the tooltip.
 */
import { nextTick, ref, watch } from 'vue'
import IconClose from './IconClose.vue'
import { isDirty, setActive, useDocuments } from '../stores/documents'
// Not the store's closeDoc, which removes a document without asking: this is
// the prompting path, the same one Ctrl+W takes.
import { requestClose } from '../commands/app-commands'

const docs = useDocuments()
const strip = ref<HTMLElement | null>(null)

/**
 * Keeps the active tab in view. The strip scrolls sideways once it overflows,
 * and nothing followed the active tab: a new document's opened out of sight.
 */
watch(
  () => [docs.activeIndex, docs.docs.length],
  async () => {
    await nextTick()
    strip.value
      ?.querySelector('.tab.is-active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
)
</script>

<template>
  <nav
    v-if="docs.docs.length > 1"
    ref="strip"
    class="tabs"
    role="tablist"
    aria-label="Open documents"
  >
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
        :title="d.path ?? d.name"
        @click="setActive(i)"
        @auxclick.middle="requestClose(i)"
      >
        <span class="tab__name">{{ d.name }}</span>
        <span v-if="isDirty(d)" class="tab__dot" aria-label="Unsaved changes">•</span>
      </button>
      <button class="tab__close" :aria-label="`Close ${d.name}`" @click.stop="requestClose(i)">
        <IconClose :size="8" />
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
  flex: 0 1 auto;
  min-width: 72px;
  max-width: 160px;
  height: 24px;
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
  flex: 1;
  min-width: 0;
  height: 100%;
  gap: 4px;
  padding: 0 2px 0 10px;
}
.tab__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab__close {
  display: grid;
  place-items: center;
  flex: none;
  height: 100%;
  padding: 0 8px 0 4px;
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
/* The strip's accent on the strip, the page's on the tab that shows the
   page: the page's accent alone was as low as 1.7:1 on the strip. */
.tab__dot {
  color: var(--chrome-accent);
}
.tab.is-active .tab__dot {
  color: var(--doc-accent);
}
.tab__close {
  opacity: 0.5;
}
.tab__close:hover {
  opacity: 1;
}
</style>
