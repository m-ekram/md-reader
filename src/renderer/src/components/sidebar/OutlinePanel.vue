<script setup lang="ts">
/** Headings of the active document. Clicking one scrolls the editor to it. */
import { computed } from 'vue'
import { extractHeadings, plainHeadingText } from '../../editor/outline'
import { activeDoc } from '../../stores/documents'

const headings = computed(() =>
  activeDoc.value ? extractHeadings(activeDoc.value.content) : []
)

/**
 * Scrolling is by heading text rather than line number: the rendered document
 * has no line numbers, and matching the heading element's text is both simple
 * and robust to the editor reflowing.
 */
function goTo(text: string, occurrence: number): void {
  const wanted = plainHeadingText(text).toLowerCase()
  const nodes = document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6')
  let seen = 0
  for (const node of nodes) {
    if ((node.textContent ?? '').trim().toLowerCase() !== wanted) continue
    if (seen++ !== occurrence) continue
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
}

/** How many earlier headings share this text, so duplicates scroll correctly. */
function occurrenceOf(index: number): number {
  const text = plainHeadingText(headings.value[index].text).toLowerCase()
  let n = 0
  for (let i = 0; i < index; i++) {
    if (plainHeadingText(headings.value[i].text).toLowerCase() === text) n++
  }
  return n
}
</script>

<template>
  <div class="panel">
    <p v-if="!activeDoc" class="panel__empty">No document open</p>
    <p v-else-if="headings.length === 0" class="panel__empty">No headings</p>
    <ul v-else class="outline">
      <li v-for="(h, i) in headings" :key="`${h.line}-${i}`">
        <button
          class="outline__item"
          :style="{ paddingLeft: `${6 + (h.level - 1) * 12}px` }"
          :class="`outline__item--h${h.level}`"
          @click="goTo(h.text, occurrenceOf(i))"
        >
          {{ plainHeadingText(h.text) }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.outline {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.outline__item {
  display: block;
  width: 100%;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: var(--sidebar-fg);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.outline__item:hover {
  background: var(--chrome-hover);
}
.outline__item--h1 { font-weight: 600; }
.outline__item--h2 { font-weight: 500; }
.outline__item--h4,
.outline__item--h5,
.outline__item--h6 { opacity: 0.8; }
</style>
