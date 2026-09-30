<script setup lang="ts">
/**
 * Sidebar shell: the four panels the View menu names, a switcher, and a drag
 * handle. Width and active panel persist through settings, so the layout comes
 * back the way it was left.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { patchSettings, useSettingsStore } from '../../stores/settings'
import { useWorkspace, workspaceName } from '../../stores/workspace'
import OutlinePanel from './OutlinePanel.vue'
import ArticlesPanel from './ArticlesPanel.vue'
import FileTreePanel from './FileTreePanel.vue'
import SearchPanel from './SearchPanel.vue'
import IconClose from '../IconClose.vue'
import { run } from '../../commands/registry'

type PanelId = 'outline' | 'articles' | 'files' | 'search'

const settings = useSettingsStore()
const ws = useWorkspace()

const panels: Array<{ id: PanelId; label: string; accel: string }> = [
  { id: 'outline', label: 'Outline', accel: 'Ctrl+Shift+1' },
  { id: 'articles', label: 'Articles', accel: 'Ctrl+Shift+2' },
  { id: 'files', label: 'Files', accel: 'Ctrl+Shift+3' },
  { id: 'search', label: 'Search', accel: 'Ctrl+Shift+F' },
]

const active = computed(() => settings.value.sidebar.panel)
const width = computed(() => settings.value.sidebar.width)

function selectPanel(id: PanelId): void {
  void patchSettings({ sidebar: { panel: id } })
}

// --- resizing ---------------------------------------------------------------

const dragging = ref(false)
const MIN = 180
const MAX = 620

function startDrag(e: PointerEvent): void {
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag, { once: true })
}

function onDrag(e: PointerEvent): void {
  if (!dragging.value) return
  const next = Math.min(MAX, Math.max(MIN, e.clientX))
  // Written straight to the local mirror while dragging; persisted once on
  // release, so a drag does not write to disk on every pointer move.
  settings.value.sidebar.width = next
}

function endDrag(): void {
  dragging.value = false
  window.removeEventListener('pointermove', onDrag)
  void patchSettings({ sidebar: { width: settings.value.sidebar.width } })
}

onBeforeUnmount(() => window.removeEventListener('pointermove', onDrag))
</script>

<template>
  <aside v-if="settings.sidebar.visible" class="sidebar" :style="{ width: `${width}px` }">
    <nav class="sidebar__tabs" role="tablist" aria-label="Sidebar panels">
      <button
        v-for="p in panels"
        :key="p.id"
        class="sidebar__tab"
        role="tab"
        :aria-selected="active === p.id"
        :class="{ 'is-active': active === p.id }"
        :title="`${p.label} (${p.accel})`"
        @click="selectPanel(p.id)"
      >
        {{ p.label }}
      </button>
    </nav>

    <div v-if="ws.root" class="sidebar__root">
      <span class="sidebar__root-name" :title="ws.root">{{ workspaceName }}</span>
      <button
        class="sidebar__close"
        title="Close Folder"
        aria-label="Close Folder"
        @click="run('file.closeFolder')"
      >
        <IconClose />
      </button>
    </div>

    <div class="sidebar__body">
      <OutlinePanel v-if="active === 'outline'" />
      <ArticlesPanel v-else-if="active === 'articles'" />
      <FileTreePanel v-else-if="active === 'files'" />
      <SearchPanel v-else />
    </div>

    <div
      class="sidebar__grip"
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      @pointerdown="startDrag"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: none;
  min-width: 0;
  background: var(--sidebar-bg);
  color: var(--sidebar-fg);
  border-right: 1px solid var(--doc-rule);
}
.sidebar__tabs {
  display: flex;
  flex: none;
  border-bottom: 1px solid var(--doc-rule);
}
.sidebar__tab {
  flex: 1;
  /* The tab bar's height, so the two rows line up side by side. */
  height: 24px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 11px;
  cursor: default;
  color: var(--sidebar-muted);
}
.sidebar__tab:hover {
  background: var(--sidebar-hover);
}
.sidebar__tab.is-active {
  color: var(--sidebar-fg);
  font-weight: 600;
  box-shadow: inset 0 -2px 0 var(--doc-accent);
}
.sidebar__tab:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}
.sidebar__root {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sidebar-muted);
  flex: none;
}
.sidebar__root-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--sidebar-muted);
}
.sidebar__close:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-fg);
}
.sidebar__body {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.sidebar__grip {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}
.sidebar__grip:hover {
  background: var(--doc-accent);
  opacity: 0.35;
}
</style>
