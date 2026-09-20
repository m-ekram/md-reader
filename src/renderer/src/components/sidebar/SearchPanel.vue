<script setup lang="ts">
/**
 * Folder-wide search. Results stream in from the worker as they are found, so
 * a large folder fills progressively rather than freezing until it finishes.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cancelSearch, runSearch, useWorkspace } from '../../stores/workspace'
import { openPath } from '../../stores/documents'

const ws = useWorkspace()
const query = ref(ws.search.query)
let debounce: number | undefined

// Debounced so each keystroke does not start a full walk; the store cancels the
// previous search before starting the next.
watch(query, (q) => {
  window.clearTimeout(debounce)
  debounce = window.setTimeout(() => void runSearch(q), 220)
})

onBeforeUnmount(() => {
  window.clearTimeout(debounce)
  void cancelSearch()
})

/** Group hits by file so a file with many matches reads as one block. */
const grouped = computed(() => {
  const map = new Map<string, typeof ws.search.hits>()
  for (const hit of ws.search.hits) {
    const list = map.get(hit.path)
    if (list) list.push(hit)
    else map.set(hit.path, [hit])
  }
  return [...map.entries()]
})
</script>

<template>
  <div class="panel">
    <div class="search__box">
      <input
        v-model="query"
        class="search__input"
        type="search"
        placeholder="Search folder…"
        aria-label="Search folder"
      />
    </div>

    <p v-if="!ws.root" class="panel__empty">No folder open</p>
    <p v-else-if="query.trim().length < 2" class="panel__empty">Type at least two characters</p>
    <p v-else-if="ws.search.running && grouped.length === 0" class="panel__empty">Searching…</p>
    <p v-else-if="grouped.length === 0" class="panel__empty">No matches</p>

    <ul v-else class="results">
      <li v-for="[path, hits] in grouped" :key="path" class="results__file">
        <p class="results__name">{{ hits[0].relativePath }}</p>
        <button
          v-for="hit in hits"
          :key="`${hit.line}-${hit.column}`"
          class="results__hit"
          @click="openPath(path)"
        >
          <span class="results__line">{{ hit.line }}</span>
          <span class="results__preview">{{ hit.preview.trim() }}</span>
        </button>
      </li>
    </ul>

    <p v-if="ws.search.truncated" class="panel__empty">Showing the first 2000 matches</p>
  </div>
</template>

<style scoped>
.search__box {
  padding: 6px;
  border-bottom: 1px solid var(--chrome-border);
}
.search__input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--doc-rule);
  border-radius: 4px;
  background: var(--doc-bg);
  color: var(--doc-fg);
  font: inherit;
  font-size: 12px;
}
.results {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.results__name {
  margin: 6px 0 2px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.results__hit {
  display: flex;
  gap: 6px;
  width: 100%;
  padding: 2px 8px;
  border: 0;
  background: transparent;
  color: var(--sidebar-fg);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: default;
}
.results__hit:hover {
  background: var(--chrome-hover);
}
.results__line {
  flex: none;
  opacity: 0.5;
  font-variant-numeric: tabular-nums;
}
.results__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
