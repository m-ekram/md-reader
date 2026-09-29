<script setup lang="ts">
/** One tree row. Self-recursive for nested folders. */
import { toggleNode, type TreeNode } from '../../stores/workspace'
import { activeDoc, openPath } from '../../stores/documents'

defineProps<{ node: TreeNode; depth: number }>()

const isActive = (path: string): boolean =>
  (activeDoc.value?.path ?? '').toLowerCase() === path.toLowerCase()
</script>

<template>
  <li class="tree__row">
    <button
      class="tree__item"
      :class="{ 'is-active': !node.entry.isDirectory && isActive(node.entry.path) }"
      :style="{ paddingLeft: `${6 + depth * 12}px` }"
      :aria-expanded="node.entry.isDirectory ? node.expanded : undefined"
      @click="node.entry.isDirectory ? toggleNode(node) : openPath(node.entry.path)"
    >
      <span class="tree__twisty" aria-hidden="true">
        {{ node.entry.isDirectory ? (node.expanded ? '▾' : '▸') : '' }}
      </span>
      <span class="tree__name">{{ node.entry.name }}</span>
    </button>

    <ul v-if="node.expanded && node.children" class="tree__children">
      <TreeItem
        v-for="child in node.children"
        :key="child.entry.path"
        :node="child"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>

<style scoped>
.tree__row,
.tree__children {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tree__item {
  display: flex;
  gap: 4px;
  align-items: center;
  width: 100%;
  padding: 3px 8px;
  border: 0;
  background: transparent;
  color: var(--sidebar-fg);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: default;
}
.tree__item:hover {
  background: var(--sidebar-hover);
}
.tree__item.is-active {
  background: var(--doc-selection);
}
.tree__twisty {
  width: 10px;
  flex: none;
  color: var(--sidebar-muted);
}
.tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
