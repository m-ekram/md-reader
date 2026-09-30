<script setup lang="ts">
/**
 * Open documents for this window. Hidden entirely when only one is open.
 *
 * Tabs are compact: each is capped in width and shrinks as more open, with the
 * name ellipsized and given in full, with its folder, in the tooltip.
 */
import { computed, nextTick, ref, watch } from 'vue'
import IconClose from './IconClose.vue'
import { tabLabels } from '../utils/tab-labels'
import { isDirty, moveDoc, setActive, useDocuments, type Doc } from '../stores/documents'
import { useWorkspace } from '../stores/workspace'
import { openContextMenu } from '../stores/context-menu'
import { run } from '../commands/registry'
// Not the store's closeDoc, which removes a document without asking: this is
// the prompting path, the same one Ctrl+W takes.
import { requestClose } from '../commands/app-commands'

const docs = useDocuments()
const ws = useWorkspace()
const strip = ref<HTMLElement | null>(null)
/** File names, with folders added where two open files share one. */
const labels = computed(() => tabLabels(docs.docs))

/**
 * Keeps the active tab in view. The strip scrolls sideways once it overflows,
 * and nothing followed the active tab: a new document's opened out of sight.
 */
/**
 * The keyboard, as a tab strip: the tab in front is the one Tab stop, the
 * arrows and Home and End move to another and show it, and Delete closes one,
 * asking first when it has unsaved work. Every tab and its × were separate
 * Tab stops, with no arrow keys.
 */
async function onKeydown(e: KeyboardEvent, i: number): Promise<void> {
  const n = docs.docs.length
  const to: Record<string, number> = {
    ArrowLeft: (i - 1 + n) % n,
    ArrowRight: (i + 1) % n,
    Home: 0,
    End: n - 1,
  }
  if (e.key in to) {
    e.preventDefault()
    setActive(to[e.key])
  } else if (e.key === 'Delete') {
    e.preventDefault()
    if (!(await requestClose(i))) return
  } else {
    return
  }
  await nextTick()
  strip.value?.querySelector<HTMLElement>('.tab.is-active .tab__select')?.focus()
}

/**
 * Closes documents one after another, as Ctrl+W would, asking about unsaved
 * work; Cancel on any stops the rest. By identity: indexes shift as tabs close.
 */
async function closeEach(targets: Doc[]): Promise<void> {
  for (const d of targets) {
    const at = docs.docs.indexOf(d)
    if (at >= 0 && !(await requestClose(at))) return
  }
}

/**
 * Dragging a tab along the strip moves it. Pointer events, not the page's
 * drag and drop, which is how files dropped on the window are opened. It
 * starts only after a few pixels, so a click is still a click.
 */
let drag: { doc: Doc; startX: number; moved: boolean; pointerId: number } | null = null
const dragging = ref<string | null>(null)

function onPointerDown(e: PointerEvent, i: number): void {
  if (e.button !== 0) return
  drag = { doc: docs.docs[i], startX: e.clientX, moved: false, pointerId: e.pointerId }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  if (!drag.moved && Math.abs(e.clientX - drag.startX) < 5) return
  drag.moved = true
  dragging.value = drag.doc.id
  const from = docs.docs.indexOf(drag.doc)
  const tabs = [...(strip.value?.querySelectorAll<HTMLElement>('.tab') ?? [])]
  const to = tabs.findIndex((t) => {
    const r = t.getBoundingClientRect()
    return e.clientX >= r.left && e.clientX < r.right
  })
  if (from >= 0 && to >= 0 && to !== from) moveDoc(from, to)
}

function onPointerUp(): void {
  drag = null
  dragging.value = null
}

/** What can be done to a tab from its right-click menu. */
function onContextMenu(e: MouseEvent, i: number): void {
  const doc = docs.docs[i]
  const path = doc.path
  const inFolder = !!path && !!ws.root && path.toLowerCase().startsWith(ws.root.toLowerCase())
  openContextMenu(e, [
    { label: 'Close', run: () => closeEach([doc]) },
    { label: 'Close Others', run: () => closeEach(docs.docs.filter((d) => d !== doc)) },
    {
      label: 'Close to the Right',
      run: () => closeEach(docs.docs.slice(docs.docs.indexOf(doc) + 1)),
    },
    { label: 'Close Saved', run: () => closeEach(docs.docs.filter((d) => !isDirty(d))) },
    { separator: true },
    {
      label: 'Copy Path',
      disabled: !path,
      run: () => path && window.api.clipboard.write({ text: path }),
    },
    {
      label: 'Reveal in Sidebar',
      disabled: !inFolder,
      run: () => {
        setActive(docs.docs.indexOf(doc))
        return run('file.revealInSidebar')
      },
    },
    {
      label: 'Show in Folder',
      disabled: !path,
      run: () => path && window.api.file.showInFolder(path),
    },
  ])
}

watch(
  () => [docs.activeIndex, docs.docs.length],
  async () => {
    await nextTick()
    strip.value
      ?.querySelector('.tab.is-active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
)
</script>

<template>
  <nav
    v-if="docs.docs.length > 1"
    ref="strip"
    class="tabs"
    role="tablist"
    aria-label="Open documents"
  >
    <div
      v-for="(d, i) in docs.docs"
      :key="d.id"
      class="tab"
      :class="{ 'is-active': i === docs.activeIndex, 'is-dragging': d.id === dragging }"
    >
      <button
        class="tab__select"
        role="tab"
        :aria-selected="i === docs.activeIndex"
        :tabindex="i === docs.activeIndex ? 0 : -1"
        :title="d.path ?? d.name"
        @click="setActive(i)"
        @auxclick.middle="requestClose(i)"
        @keydown="onKeydown($event, i)"
        @contextmenu="onContextMenu($event, i)"
        @pointerdown="onPointerDown($event, i)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <span class="tab__name">{{ labels[i] }}</span>
        <span v-if="isDirty(d)" class="tab__dot" aria-label="Unsaved changes">•</span>
      </button>
      <!-- Out of the Tab order: Delete on the tab does the same. -->
      <button
        class="tab__close"
        tabindex="-1"
        :aria-label="`Close ${d.name}`"
        @click.stop="requestClose(i)"
      >
        <IconClose :size="8" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 1px;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-border);
  overflow-x: auto;
  flex: none;
}
.tab {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 72px;
  max-width: 160px;
  height: 24px;
  background: transparent;
  color: var(--chrome-fg-dim);
  font-size: 12px;
  white-space: nowrap;
}
.tab__select,
.tab__close {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: default;
}
.tab__select {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  gap: 4px;
  padding: 0 2px 0 10px;
}
.tab__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab__close {
  display: grid;
  place-items: center;
  flex: none;
  height: 100%;
  padding: 0 8px 0 4px;
}
.tab__select:focus-visible,
.tab__close:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}
.tab.is-active {
  background: var(--doc-bg);
  color: var(--doc-fg);
}
.tab.is-dragging {
  opacity: 0.7;
}
.tab__select {
  touch-action: none;
}
.tab:hover:not(.is-active) {
  background: var(--chrome-hover);
}
/* The strip's accent on the strip, the page's on the tab that shows the
   page: the page's accent alone was as low as 1.7:1 on the strip. */
.tab__dot {
  color: var(--chrome-accent);
}
.tab.is-active .tab__dot {
  color: var(--doc-accent);
}
.tab__close {
  opacity: 0.5;
}
.tab__close:hover {
  opacity: 1;
}
</style>
