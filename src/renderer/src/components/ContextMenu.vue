<script setup lang="ts">
/**
 * The app's right-click menu (stores/context-menu.ts), drawn as the menus are.
 *
 * Opened by the keyboard's menu key as well as the mouse; the arrow keys move
 * through it, Enter runs an item, and Escape, a click elsewhere or leaving the
 * window closes it. The focus goes back where it was.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { closeContextMenu, contextMenu, type ContextItem } from '../stores/context-menu'
import { useFocusTrap } from '../composables/useFocusTrap'

const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, () => contextMenu.open, { trap: false })

const isItem = (i: ContextItem): i is Extract<ContextItem, { label: string }> => 'label' in i

function buttons(): HTMLButtonElement[] {
  return [...(panel.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
}

watch(
  () => contextMenu.open,
  async (open) => {
    if (!open) return
    await nextTick()
    const el = panel.value
    if (!el) return
    // Inside the window, flipped back from the right and bottom edges.
    const { offsetWidth: w, offsetHeight: h } = el
    el.style.left = `${Math.max(4, Math.min(contextMenu.x, window.innerWidth - w - 4))}px`
    el.style.top = `${Math.max(4, Math.min(contextMenu.y, window.innerHeight - h - 4))}px`
    buttons()[0]?.focus()
  }
)

async function choose(item: ContextItem): Promise<void> {
  if (!isItem(item) || item.disabled) return
  closeContextMenu()
  // After the menu has gone and the focus is back where it was.
  await nextTick()
  await item.run()
}

function onKeydown(e: KeyboardEvent): void {
  const list = buttons()
  const at = list.indexOf(document.activeElement as HTMLButtonElement)
  const move = (to: number): void => {
    e.preventDefault()
    list[(to + list.length) % list.length]?.focus()
  }
  if (e.key === 'ArrowDown') move(at + 1)
  else if (e.key === 'ArrowUp') move(at - 1)
  else if (e.key === 'Home') move(0)
  else if (e.key === 'End') move(list.length - 1)
  else if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault()
    closeContextMenu()
  }
}

function onPointerDown(e: PointerEvent): void {
  if (contextMenu.open && !panel.value?.contains(e.target as Node)) closeContextMenu()
}

window.addEventListener('pointerdown', onPointerDown, true)
window.addEventListener('blur', closeContextMenu)
window.addEventListener('resize', closeContextMenu)
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('resize', closeContextMenu)
})
</script>

<template>
  <div
    v-if="contextMenu.open"
    ref="panel"
    class="context-menu"
    role="menu"
    @keydown="onKeydown"
    @contextmenu.prevent
  >
    <template v-for="(item, i) in contextMenu.items" :key="i">
      <div v-if="!isItem(item)" class="context-menu__sep" role="separator" />
      <button
        v-else
        class="context-menu__item"
        role="menuitem"
        tabindex="-1"
        :disabled="item.disabled"
        :aria-disabled="item.disabled"
        @click="choose(item)"
        @pointerenter="($event.target as HTMLElement).focus()"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 300;
  min-width: 180px;
  padding: 4px 0;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 6px;
  box-shadow: var(--menu-shadow);
  font-family: var(--ui-font);
  font-size: 13px;
}
.context-menu__item {
  display: block;
  width: 100%;
  padding: 5px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}
.context-menu__item:focus {
  outline: none;
  background: var(--menu-hover);
}
.context-menu__item:disabled {
  color: var(--menu-fg-disabled);
}
.context-menu__sep {
  height: 1px;
  margin: 4px 0;
  background: var(--menu-border);
}
</style>
