<script setup lang="ts">
/** Lazy folder tree: children are read when a folder is first expanded. */
import { useWorkspace } from '../../stores/workspace'
import TreeItem from './TreeItem.vue'

const ws = useWorkspace()
</script>

<template>
  <div class="panel">
    <p v-if="!ws.root" class="panel__empty">No folder open</p>
    <p v-else-if="ws.tree.length === 0" class="panel__empty">Empty folder</p>
    <ul v-else class="tree">
      <TreeItem v-for="node in ws.tree" :key="node.entry.path" :node="node" :depth="0" />
    </ul>
  </div>
</template>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
</style>
