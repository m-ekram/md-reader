<script setup lang="ts">
/** One tree row. Self-recursive for nested folders. */
import { toggleNode, useWorkspace, type TreeNode } from '../../stores/workspace'
import { activeDoc, openPath } from '../../stores/documents'
import { openContextMenu, type ContextItem } from '../../stores/context-menu'

defineProps<{ node: TreeNode; depth: number; tabStop: string }>()

const ws = useWorkspace()

const isActive = (path: string): boolean =>
  (activeDoc.value?.path ?? '').toLowerCase() === path.toLowerCase()

/** What can be done to a file or folder from where it is listed. */
function onContextMenu(e: MouseEvent, node: TreeNode): void {
  const path = node.entry.path
  const items: ContextItem[] = node.entry.isDirectory
    ? []
    : [{ label: 'Open', run: () => openPath(path) }, { separator: true }]
  items.push(
    { label: 'Show in Folder', run: () => window.api.file.showInFolder(path) },
    { label: 'Copy Path', run: () => window.api.clipboard.write({ text: path }) }
  )
  openContextMenu(e, items)
}
</script>

<template>
  <li class="tree__row" role="none">
    <!--
      The row is the tree item: a button, so Enter and Space act on it. One row
      is the Tab stop (FileTreePanel moves it with the arrow keys).
    -->
    <button
      class="tree__item"
      role="treeitem"
      :class="{ 'is-active': !node.entry.isDirectory && isActive(node.entry.path) }"
      :style="{ paddingLeft: `${6 + depth * 12}px` }"
      :aria-level="depth + 1"
      :aria-expanded="node.entry.isDirectory ? node.expanded : undefined"
      :aria-selected="!node.entry.isDirectory && isActive(node.entry.path)"
      :tabindex="node.entry.path === tabStop ? 0 : -1"
      :data-path="node.entry.path"
      @focus="ws.treeFocus = node.entry.path"
      @click="node.entry.isDirectory ? toggleNode(node) : openPath(node.entry.path)"
      @contextmenu="onContextMenu($event, node)"
    >
      <span class="tree__twisty" aria-hidden="true">
        {{ node.entry.isDirectory ? (node.expanded ? '▾' : '▸') : '' }}
      </span>
      <span class="tree__name">{{ node.entry.name }}</span>
    </button>

    <ul v-if="node.expanded && node.children" class="tree__children" role="group">
      <TreeItem
        v-for="child in node.children"
        :key="child.entry.path"
        :node="child"
        :depth="depth + 1"
        :tab-stop="tabStop"
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
.tree__item:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
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
