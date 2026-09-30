<script setup lang="ts">
/**
 * Folder-wide search. Results stream in from the worker as they are found, so
 * a large folder fills progressively rather than freezing until it finishes.
 */
import NoFolder from './NoFolder.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cancelSearch, runSearch, setSearchCase, useWorkspace } from '../../stores/workspace'
import { activeDoc, openPath } from '../../stores/documents'
import { showMatch } from '../../editor/find'
import type { SearchHit } from '../../../../main/search-worker'

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

/**
 * Opens the file at the match clicked, selected and in view, with the term in
 * the find bar. It used to open the file at the top, leaving the match to be
 * found again.
 */
async function openHit(hit: SearchHit): Promise<void> {
  const { query, caseSensitive } = ws.search
  // The find bar takes the focus, not the document.
  const doc = await openPath(hit.path, { focus: false })
  if (!doc) return
  // The view is built after the document comes to the front.
  const deadline = performance.now() + 10_000
  while (!showMatch(query, hit.ordinal, caseSensitive)) {
    if (performance.now() > deadline || activeDoc.value?.id !== doc.id) return
    await new Promise((r) => requestAnimationFrame(r))
  }
}

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
        :disabled="!ws.root"
      />
      <button
        class="search__case"
        :class="{ 'is-on': ws.search.caseSensitive }"
        title="Match case"
        aria-label="Match case"
        :aria-pressed="ws.search.caseSensitive"
        :disabled="!ws.root"
        @click="setSearchCase(!ws.search.caseSensitive)"
      >
        Aa
      </button>
    </div>

    <NoFolder v-if="!ws.root" />
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
          @click="openHit(hit)"
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
  display: flex;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--sidebar-border);
}
.search__case {
  flex: none;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--sidebar-fg);
  font: inherit;
  font-size: 12px;
  cursor: default;
}
.search__case:hover:not(:disabled) {
  background: var(--sidebar-hover);
}
/* As the find bar shows an option that is on: a tint and an outline. */
.search__case.is-on {
  background: color-mix(in srgb, var(--doc-accent) 16%, transparent);
  box-shadow: inset 0 0 0 1px var(--doc-accent);
}
.search__case:disabled {
  opacity: 0.6;
}
.search__input {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--doc-rule);
  border-radius: 4px;
  background: var(--doc-bg);
  color: var(--doc-fg);
  font: inherit;
  font-size: 12px;
}
.search__input:disabled {
  opacity: 0.6;
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
  color: var(--sidebar-muted);
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
  background: var(--sidebar-hover);
}
.results__line {
  flex: none;
  color: var(--sidebar-muted);
  font-variant-numeric: tabular-nums;
}
.results__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
