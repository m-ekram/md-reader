<script setup lang="ts">
/**
 * Lazy folder tree: children are read when a folder is first expanded.
 *
 * A tree for the keyboard as well as the mouse: one row is the Tab stop, and
 * the arrow keys move through the rows that are showing, open and close
 * folders, and go into and out of them, as tree views do elsewhere.
 */
import { computed, nextTick, ref } from 'vue'
import NoFolder from './NoFolder.vue'
import { toggleNode, useWorkspace, type TreeNode } from '../../stores/workspace'
import TreeItem from './TreeItem.vue'

const ws = useWorkspace()
const list = ref<HTMLElement | null>(null)

/** The row Tab lands on: the last one focused, while it is showing, else the first. */
const tabStop = computed(() => {
  const rows = visible(ws.tree)
  return rows.some((n) => n.entry.path === ws.treeFocus)
    ? ws.treeFocus
    : (rows[0]?.entry.path ?? '')
})

/** The rows showing, in order. */
function visible(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    out.push(n)
    if (n.expanded && n.children) visible(n.children, out)
  }
  return out
}

/** A row's folder, or null at the top. */
function parentOf(
  target: TreeNode,
  nodes = ws.tree,
  parent: TreeNode | null = null
): TreeNode | null | undefined {
  for (const n of nodes) {
    if (n === target) return parent
    if (n.children) {
      const found = parentOf(target, n.children, n)
      if (found !== undefined) return found
    }
  }
  return undefined
}

async function focusRow(node: TreeNode | null | undefined): Promise<void> {
  if (!node) return
  ws.treeFocus = node.entry.path
  await nextTick()
  const row = [...(list.value?.querySelectorAll<HTMLElement>('.tree__item') ?? [])].find(
    (el) => el.dataset.path === node.entry.path
  )
  row?.focus()
}

async function onKeydown(e: KeyboardEvent): Promise<void> {
  const rows = visible(ws.tree)
  const at = rows.findIndex(
    (n) => n.entry.path === (document.activeElement as HTMLElement | null)?.dataset?.path
  )
  if (at < 0) return
  const node = rows[at]
  const keys: Record<string, () => Promise<void> | void> = {
    ArrowDown: () => focusRow(rows[at + 1]),
    ArrowUp: () => focusRow(rows[at - 1]),
    Home: () => focusRow(rows[0]),
    End: () => focusRow(rows[rows.length - 1]),
    ArrowRight: async () => {
      if (!node.entry.isDirectory) return
      if (!node.expanded) await toggleNode(node)
      else await focusRow(node.children?.[0])
    },
    ArrowLeft: async () => {
      if (node.entry.isDirectory && node.expanded) await toggleNode(node)
      else await focusRow(parentOf(node))
    },
  }
  const act = keys[e.key]
  if (!act) return
  e.preventDefault()
  await act()
}
</script>

<template>
  <div class="panel">
    <NoFolder v-if="!ws.root" />
    <p v-else-if="ws.tree.length === 0" class="panel__empty">Empty folder</p>
    <ul v-else ref="list" class="tree" role="tree" aria-label="Files" @keydown="onKeydown">
      <TreeItem
        v-for="node in ws.tree"
        :key="node.entry.path"
        :node="node"
        :depth="0"
        :tab-stop="tabStop"
      />
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
