<script setup lang="ts">
/** Every markdown file in the workspace, flat. The "all my notes" list. */
import { computed } from 'vue'
import { useWorkspace } from '../../stores/workspace'
import { activeDoc, openPath } from '../../stores/documents'

const ws = useWorkspace()
const files = computed(() => ws.articles)

const isActive = (path: string): boolean =>
  (activeDoc.value?.path ?? '').toLowerCase() === path.toLowerCase()
</script>

<template>
  <div class="panel">
    <p v-if="!ws.root" class="panel__empty">No folder open</p>
    <p v-else-if="ws.loadingArticles" class="panel__empty">Scanning…</p>
    <p v-else-if="files.length === 0" class="panel__empty">No markdown files</p>
    <ul v-else class="articles">
      <li v-for="f in files" :key="f.path">
        <button
          class="articles__item"
          :class="{ 'is-active': isActive(f.path) }"
          :title="f.relativePath"
          @click="openPath(f.path)"
        >
          <span class="articles__name">{{ f.name }}</span>
          <span v-if="f.relativePath.includes('/')" class="articles__dir">
            {{ f.relativePath.slice(0, f.relativePath.lastIndexOf('/')) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.articles {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.articles__item {
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
}
.articles__item:hover {
  background: var(--sidebar-hover);
}
.articles__item.is-active {
  background: var(--doc-selection);
}
.articles__name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.articles__dir {
  display: block;
  font-size: 11px;
  color: var(--sidebar-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
