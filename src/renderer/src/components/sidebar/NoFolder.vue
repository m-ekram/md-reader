<script setup lang="ts">
/**
 * What the folder panels show before a folder is open: the way to open one,
 * not only the news that none is.
 */
import { run } from '../../commands/registry'
</script>

<template>
  <div class="no-folder">
    <p class="panel__empty">No folder open</p>
    <button class="no-folder__open" @click="run('file.openFolder')">Open Folder…</button>
  </div>
</template>

<style scoped>
.no-folder {
  padding-bottom: 8px;
}
.no-folder__open {
  margin: 0 8px;
  padding: 4px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: 4px;
  background: transparent;
  color: var(--sidebar-fg);
  font: inherit;
  font-size: 12px;
  cursor: default;
}
.no-folder__open:hover {
  background: var(--sidebar-hover);
}
</style>
