<script setup lang="ts">
/**
 * The notes offered while a `[[wiki link]]` is typed, under the brackets.
 *
 * The editor keeps the focus throughout: the keys that move through the list
 * reach it from the editor (editor/wiki-suggest.ts), and a click on an item is
 * kept from taking the focus away. The editor is pointed at the picked item
 * with aria-activedescendant, as a combobox is at its list.
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  acceptWikiSuggestion,
  closeWikiSuggestion,
  wikiSuggestion,
  wikiSuggestionEditor,
} from '../stores/wiki-suggest'
import { activeDoc } from '../stores/documents'

/** The list's height at most; it opens above the line when there is no room below. */
const MAX_HEIGHT = 240
const WIDTH = 320

const place = computed(() => {
  const s = wikiSuggestion.value
  if (!s) return {}
  const left = `${Math.max(8, Math.min(s.left, window.innerWidth - WIDTH - 8))}px`
  return window.innerHeight - s.bottom < MAX_HEIGHT + 12
    ? { left, bottom: `${window.innerHeight - s.top + 4}px` }
    : { left, top: `${s.bottom + 4}px` }
})

// Another document in front: the list was for the one before.
watch(
  () => activeDoc.value?.id,
  (id) => {
    if (wikiSuggestion.value && wikiSuggestion.value.docId !== id) closeWikiSuggestion()
  }
)

let described: HTMLElement | null = null
watch(
  () => (wikiSuggestion.value ? wikiSuggestion.value.selected : -1),
  (selected) => {
    const editor = selected >= 0 ? wikiSuggestionEditor() : null
    if (described && described !== editor) {
      described.removeAttribute('aria-activedescendant')
      described.removeAttribute('aria-controls')
    }
    if (editor) {
      editor.setAttribute('aria-activedescendant', `wiki-option-${selected}`)
      editor.setAttribute('aria-controls', 'wiki-suggestions')
    }
    described = editor
  }
)

// The list is placed where the brackets were; after a scroll it would not be.
const onScroll = (): void => {
  if (wikiSuggestion.value) closeWikiSuggestion()
}
onMounted(() => window.addEventListener('scroll', onScroll, true))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll, true))
</script>

<template>
  <ul
    v-if="wikiSuggestion"
    id="wiki-suggestions"
    class="wiki-suggest"
    role="listbox"
    aria-label="Notes"
    :style="place"
    @mousedown.prevent
  >
    <li
      v-for="(item, i) in wikiSuggestion.items"
      :id="`wiki-option-${i}`"
      :key="item.path"
      class="wiki-suggest__item"
      role="option"
      :aria-selected="i === wikiSuggestion.selected"
      :class="{ 'is-selected': i === wikiSuggestion.selected }"
      @pointermove="wikiSuggestion.selected = i"
      @click="acceptWikiSuggestion(i)"
    >
      <span class="wiki-suggest__name">{{ item.insert }}</span>
      <span class="wiki-suggest__path">{{ item.relativePath }}</span>
    </li>
  </ul>
</template>

<style scoped>
.wiki-suggest {
  position: fixed;
  z-index: 150;
  width: 320px;
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 6px;
  box-shadow: var(--menu-shadow);
  font-family: var(--ui-font);
}
.wiki-suggest__item {
  display: flex;
  flex-direction: column;
  padding: 4px 10px;
  cursor: default;
}
.wiki-suggest__item.is-selected {
  background: var(--menu-hover);
}
.wiki-suggest__name {
  font-size: 13px;
}
.wiki-suggest__path {
  font-size: 11px;
  color: var(--menu-fg-muted);
}
</style>
