<script setup lang="ts">
/**
 * The application menu bar.
 *
 * Because the window is frameless, the native Windows menu is gone — and with it
 * Alt navigation, arrow keys, type-ahead and screen reader support. All of that
 * has to be earned back here, which is why this component is larger than a menu
 * "looks" like it should be.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { type MenuNode } from '../commands/menus'
import { resolvedMenus as resolveMenus } from '../commands/dynamic-menu'
import {
  commandEpoch,
  disabledReason,
  isChecked,
  isEnabled,
  isRegistered,
  run,
} from '../commands/registry'

const openIndex = ref<number | null>(null)
const activePath = ref<number[]>([])
const bar = ref<HTMLElement | null>(null)

let typeAhead = ''
let typeAheadTimer: number | undefined

const resolvedMenus = computed(() => {
  // Touch the epoch so enabled/checked re-evaluate when app state changes.
  void commandEpoch.value
  return resolveMenus()
})

function itemState(id: string) {
  void commandEpoch.value
  return {
    registered: isRegistered(id),
    enabled: isEnabled(id),
    checked: isChecked(id),
    reason: disabledReason(id),
  }
}

/**
 * What a screen reader calls an item: a plain command, a toggle, or one of a
 * set. Every tickable item was announced as one of a set, and in a submenu
 * none said whether it was ticked.
 */
function itemRole(node: { id: string; radio?: boolean }): string {
  if (itemState(node.id).checked === undefined) return 'menuitem'
  return node.radio ? 'menuitemradio' : 'menuitemcheckbox'
}

/**
 * Why an item cannot be chosen.
 *
 * "Not available yet" means this version has not implemented it; a stated
 * reason means it will stay greyed and says why. Items that are simply
 * inapplicable right now — a table command outside a table — get neither,
 * because the greying is self-explanatory where the caret is.
 */
function tooltip(id: string): string | undefined {
  const state = itemState(id)
  if (!state.registered) return 'Not available yet'
  if (!state.enabled && state.reason) return state.reason
  return undefined
}

function openMenu(i: number): void {
  openIndex.value = i
  activePath.value = []
}

function closeMenu(refocus = true): void {
  openIndex.value = null
  activePath.value = []
  if (refocus)
    (bar.value?.querySelector('[data-top="true"][tabindex="0"]') as HTMLElement | null)?.focus()
}

async function activate(id: string): Promise<void> {
  if (!isEnabled(id)) return
  closeMenu(false)
  await run(id)
}

/** Flat list of focusable nodes in the currently open menu level. */
function currentItems(): MenuNode[] {
  if (openIndex.value === null) return []
  let items = resolvedMenus.value[openIndex.value].items
  for (const idx of activePath.value.slice(0, -1)) {
    const n = items[idx]
    if (n?.kind === 'submenu') items = n.items
  }
  return items
}

function focusableIndexes(items: MenuNode[]): number[] {
  return items.map((n, i) => (n.kind === 'separator' ? -1 : i)).filter((i) => i >= 0)
}

function moveWithin(delta: number): void {
  const items = currentItems()
  const focusable = focusableIndexes(items)
  if (focusable.length === 0) return
  const depth = activePath.value.length
  const current = depth === 0 ? -1 : activePath.value[depth - 1]
  const pos = focusable.indexOf(current)
  const next = focusable[(pos + delta + focusable.length) % focusable.length] ?? focusable[0]
  if (depth === 0) activePath.value = [next]
  else activePath.value = [...activePath.value.slice(0, -1), next]
}

function enterSubmenu(): void {
  const items = currentItems()
  const idx = activePath.value[activePath.value.length - 1]
  const node = items[idx]
  if (node?.kind === 'submenu') {
    const first = focusableIndexes(node.items)[0]
    if (first !== undefined) activePath.value = [...activePath.value, first]
  }
}

function leaveSubmenu(): void {
  if (activePath.value.length > 1) activePath.value = activePath.value.slice(0, -1)
}

function onKeydown(e: KeyboardEvent): void {
  if (openIndex.value === null) return

  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      closeMenu()
      return
    case 'ArrowDown':
      e.preventDefault()
      moveWithin(1)
      return
    case 'ArrowUp':
      e.preventDefault()
      moveWithin(-1)
      return
    case 'ArrowRight': {
      e.preventDefault()
      const items = currentItems()
      const node = items[activePath.value[activePath.value.length - 1]]
      if (node?.kind === 'submenu') enterSubmenu()
      else openMenu((openIndex.value + 1) % resolvedMenus.value.length)
      return
    }
    case 'ArrowLeft':
      e.preventDefault()
      if (activePath.value.length > 1) leaveSubmenu()
      else openMenu((openIndex.value - 1 + resolvedMenus.value.length) % resolvedMenus.value.length)
      return
    case 'Home':
      e.preventDefault()
      activePath.value = [focusableIndexes(currentItems())[0]]
      return
    case 'End': {
      e.preventDefault()
      const f = focusableIndexes(currentItems())
      activePath.value = [f[f.length - 1]]
      return
    }
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const items = currentItems()
      const node = items[activePath.value[activePath.value.length - 1]]
      if (node?.kind === 'submenu') enterSubmenu()
      else if (node?.kind === 'item') void activate(node.id)
      return
    }
  }

  // Type-ahead: jump to the next item whose label starts with what was typed.
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    typeAhead += e.key.toLowerCase()
    window.clearTimeout(typeAheadTimer)
    typeAheadTimer = window.setTimeout(() => (typeAhead = ''), 600)

    const items = currentItems()
    const match = items.findIndex(
      (n) => n.kind !== 'separator' && 'label' in n && n.label.toLowerCase().startsWith(typeAhead)
    )
    if (match >= 0) {
      e.preventDefault()
      const depth = activePath.value.length
      if (depth <= 1) activePath.value = [match]
      else activePath.value = [...activePath.value.slice(0, -1), match]
    }
  }
}

/** Alt alone focuses the menu bar, matching the Windows convention. */
function onWindowKeydown(e: KeyboardEvent): void {
  if (e.key === 'Alt') altHeld.value = true
  if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && openIndex.value === null) {
    altPressedAlone = true
  } else {
    altPressedAlone = false
  }
}
let altPressedAlone = false

/** Underlines each menu's letter while Alt is down. */
const altHeld = ref(false)

/** The label around its Alt letter, which is underlined while Alt is held. */
function labelParts(label: string, mnemonic?: string): [string, string, string] {
  const at = mnemonic ? label.toLowerCase().indexOf(mnemonic.toLowerCase()) : -1
  if (at < 0) return [label, '', '']
  return [label.slice(0, at), label[at], label.slice(at + 1)]
}

/**
 * Alt and a menu's letter opens it, with its first item ready, as Windows
 * menus do. Taken before the document sees the keys. Shift is left alone:
 * Alt+Shift+P is Print.
 */
function onMnemonic(e: KeyboardEvent): void {
  if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || e.key.length !== 1) return
  const i = resolvedMenus.value.findIndex((m) => m.mnemonic?.toLowerCase() === e.key.toLowerCase())
  if (i < 0) return
  e.preventDefault()
  e.stopPropagation()
  altPressedAlone = false
  altHeld.value = false
  openMenu(i)
  const first = focusableIndexes(resolvedMenus.value[i].items)[0]
  if (first !== undefined) activePath.value = [first]
}

function onWindowBlur(): void {
  altHeld.value = false
}

function onWindowKeyup(e: KeyboardEvent): void {
  if (e.key === 'Alt') altHeld.value = false
  if (e.key === 'Alt' && altPressedAlone) {
    e.preventDefault()
    altPressedAlone = false
    if (openIndex.value === null) {
      const first = bar.value?.querySelector('[data-top="true"]') as HTMLElement | null
      first?.focus()
    }
  }
}

function onDocumentPointerDown(e: PointerEvent): void {
  if (openIndex.value === null) return
  if (!bar.value?.contains(e.target as Node)) closeMenu(false)
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('keydown', onMnemonic, true)
  window.addEventListener('keyup', onWindowKeyup)
  window.addEventListener('blur', onWindowBlur)
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('keydown', onMnemonic, true)
  window.removeEventListener('keyup', onWindowKeyup)
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

/**
 * Places an open submenu beside its row, inside the window.
 *
 * A menu scrolls when it is taller than the window, and a scrolling element
 * clips what hangs out of it, so a submenu is positioned against the window
 * instead: beside its row, flipped to the left when there is no room on the
 * right, and moved up when it would run off the bottom.
 */
function placeSubmenu(): void {
  const nested = bar.value?.querySelector<HTMLElement>('.menu--nested')
  const row = nested?.parentElement?.getBoundingClientRect()
  if (!nested || !row) return
  const { offsetWidth: w, offsetHeight: h } = nested
  let left = row.right - 2
  if (left + w > window.innerWidth - 4) left = Math.max(4, row.left - w + 2)
  const top = Math.max(4, Math.min(row.top - 7, window.innerHeight - h - 4))
  nested.style.left = `${left}px`
  nested.style.top = `${top}px`
}

/** A submenu is placed against its row, so it follows the row as the menu scrolls. */
function onMenuScroll(): void {
  placeSubmenu()
}

// Keep DOM focus on the active item so screen readers follow the selection.
watch([openIndex, activePath], async () => {
  await nextTick()
  placeSubmenu()
  const active = bar.value?.querySelector('[data-active="true"]') as HTMLElement | null
  if (active) {
    active.focus()
    return
  }
  // No item highlighted yet (just switched menus): keep focus on the open menu's
  // own button, so Escape and the arrow keys still reach this component.
  if (openIndex.value !== null) {
    const tops = bar.value?.querySelectorAll('[data-top="true"]')
    ;(tops?.[openIndex.value] as HTMLElement | undefined)?.focus()
  }
})

function isActive(path: number[]): boolean {
  return path.length === activePath.value.length && path.every((v, i) => v === activePath.value[i])
}
</script>

<template>
  <div ref="bar" class="menubar" role="menubar" aria-label="Application" @keydown="onKeydown">
    <div
      v-for="(menu, i) in resolvedMenus"
      :key="menu.label"
      class="menubar__root"
      :class="{ 'is-open': openIndex === i }"
    >
      <button
        class="menubar__top"
        role="menuitem"
        data-top="true"
        :tabindex="i === 0 ? 0 : -1"
        :aria-expanded="openIndex === i"
        aria-haspopup="true"
        :aria-keyshortcuts="menu.mnemonic ? `Alt+${menu.mnemonic}` : undefined"
        @click="openIndex === i ? closeMenu() : openMenu(i)"
        @mouseenter="openIndex !== null && openIndex !== i && openMenu(i)"
      >
        {{ labelParts(menu.label, menu.mnemonic)[0]
        }}<span class="menubar__mnemonic" :class="{ 'is-shown': altHeld }">{{
          labelParts(menu.label, menu.mnemonic)[1]
        }}</span
        >{{ labelParts(menu.label, menu.mnemonic)[2] }}
      </button>

      <div
        v-if="openIndex === i"
        class="menu"
        role="menu"
        :aria-label="menu.label"
        @scroll.self="onMenuScroll"
      >
        <template v-for="(node, j) in menu.items" :key="j">
          <div v-if="node.kind === 'separator'" class="menu__sep" role="separator" />

          <div v-else-if="node.kind === 'submenu'" class="menu__row menu__row--sub">
            <button
              class="menu__item"
              role="menuitem"
              aria-haspopup="true"
              :aria-expanded="activePath.length > 1 && activePath[0] === j"
              :data-active="isActive([j]) || (activePath[0] === j && activePath.length > 1)"
              tabindex="-1"
              @click="activePath = [j, 0]"
              @mouseenter="activePath = [j, 0]"
            >
              <span class="menu__label">{{ node.label }}</span>
              <span class="menu__arrow" aria-hidden="true">›</span>
            </button>

            <div
              v-if="activePath[0] === j && activePath.length > 1"
              class="menu menu--nested"
              role="menu"
              :aria-label="node.label"
            >
              <template v-for="(sub, k) in node.items" :key="k">
                <div v-if="sub.kind === 'separator'" class="menu__sep" role="separator" />
                <button
                  v-else-if="sub.kind === 'item'"
                  class="menu__item"
                  :role="itemRole(sub)"
                  tabindex="-1"
                  :data-active="isActive([j, k])"
                  :aria-disabled="!itemState(sub.id).enabled"
                  :aria-checked="itemState(sub.id).checked"
                  :class="{ 'is-disabled': !itemState(sub.id).enabled }"
                  :title="tooltip(sub.id)"
                  @click="activate(sub.id)"
                  @mouseenter="activePath = [j, k]"
                >
                  <span class="menu__check" aria-hidden="true">{{
                    itemState(sub.id).checked ? '✓' : ''
                  }}</span>
                  <span class="menu__label">{{ sub.label }}</span>
                  <span class="menu__accel">{{ sub.accel ?? '' }}</span>
                </button>
              </template>
            </div>
          </div>

          <button
            v-else-if="node.kind === 'item'"
            class="menu__item"
            tabindex="-1"
            :role="itemRole(node)"
            :data-active="isActive([j])"
            :aria-disabled="!itemState(node.id).enabled"
            :aria-checked="itemState(node.id).checked"
            :class="{ 'is-disabled': !itemState(node.id).enabled }"
            :title="tooltip(node.id)"
            @click="activate(node.id)"
            @mouseenter="activePath = [j]"
          >
            <span class="menu__check" aria-hidden="true">{{
              itemState(node.id).checked ? '✓' : ''
            }}</span>
            <span class="menu__label">{{ node.label }}</span>
            <span class="menu__accel">{{ node.accel ?? '' }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menubar {
  display: flex;
  align-items: stretch;
  height: 26px;
  background: var(--chrome-bg);
  -webkit-app-region: drag;
  user-select: none;
}
.menubar__root {
  position: relative;
  -webkit-app-region: no-drag;
}
.menubar__mnemonic.is-shown {
  text-decoration: underline;
}
.menubar__top {
  height: 100%;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--chrome-fg);
  font: inherit;
  font-size: 13px;
  cursor: default;
}
.menubar__top:hover,
.menubar__root.is-open .menubar__top {
  background: var(--chrome-hover);
}
.menubar__top:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}

.menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  min-width: 232px;
  /* So a maximum height includes the padding and border. */
  box-sizing: border-box;
  padding: 6px 0;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: 6px;
  box-shadow: var(--menu-shadow);
}
/* Never taller than the window below the menu bar: it scrolls instead. */
.menu:not(.menu--nested) {
  max-height: calc(100vh - 34px);
  overflow-y: auto;
}
/* Placed against the window by placeSubmenu(): a scrolling menu would clip it. */
.menu--nested {
  position: fixed;
  max-height: calc(100vh - 8px);
  overflow-y: auto;
}
.menu__row--sub {
  position: relative;
}
.menu__sep {
  height: 1px;
  margin: 5px 0;
  background: var(--menu-border);
}
.menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 5px 12px 5px 8px;
  border: 0;
  background: transparent;
  color: var(--menu-fg);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: default;
  white-space: nowrap;
}
.menu__item[data-active='true'] {
  background: var(--menu-hover);
}
.menu__item:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}
.menu__item.is-disabled {
  color: var(--menu-fg-disabled);
}
.menu__check {
  width: 12px;
  flex: none;
  font-size: 12px;
}
.menu__label {
  flex: 1;
}
.menu__accel,
.menu__arrow {
  color: var(--menu-fg-muted);
  font-size: 12px;
  flex: none;
}
.menu__item[data-active='true'] .menu__accel {
  color: var(--menu-fg);
}
/* A greyed-out item's shortcut is greyed out with it. */
.menu__item.is-disabled .menu__accel {
  color: inherit;
}
</style>
