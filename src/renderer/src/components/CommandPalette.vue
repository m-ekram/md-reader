<script setup lang="ts">
/**
 * The command palette (Ctrl+Shift+P): every menu command, searchable.
 *
 * Built from the same menu data the menu bar renders, so a command added to
 * one appears in the other without a second list to maintain. Unimplemented
 * commands are left out entirely rather than shown disabled — the menu shows
 * them greyed because it is a fixed specification, whereas a search result you
 * cannot run is only noise.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { EXTRA_COMMANDS, flattenMenu, type FlatMenuItem } from '../commands/menus'
import { resolvedMenus } from '../commands/dynamic-menu'
import { commandEpoch, getCommand, isEnabled, isRegistered, run } from '../commands/registry'
import { fuzzyScore } from '../utils/fuzzy'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const query = ref('')
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    query.value = ''
    selected.value = 0
    await nextTick()
    input.value?.focus()
  }
)

/**
 * Commands that exist, in menu order.
 *
 * Read through `commandEpoch` so the list reacts to registration: theme and
 * recent-file commands are generated after boot, and the enabled state of
 * everything else changes as the caret moves.
 */
const available = computed<FlatMenuItem[]>(() => {
  void commandEpoch.value
  // With the themes and recent files filled in, so they can be found by name,
  // and the few commands that live outside the menu.
  const extra = EXTRA_COMMANDS.map((c) => ({ id: c.id, label: c.label, path: '', accel: c.accel }))
  return [...flattenMenu(resolvedMenus()), ...extra]
    .filter((entry) => isRegistered(entry.id))
    .map((entry) => ({ ...entry, label: getCommand(entry.id)?.label ?? entry.label }))
})

interface Hit {
  entry: FlatMenuItem
  enabled: boolean
  score: number
}

const results = computed<Hit[]>(() => {
  const q = query.value.trim().toLowerCase()
  const out: Hit[] = []

  for (const entry of available.value) {
    const enabled = isEnabled(entry.id)
    if (q.length === 0) {
      out.push({ entry, enabled, score: 0 })
      continue
    }
    // Matched against the label and against "path › label", so typing "table
    // row" finds an item whose own label is only "Add Row Above".
    const byLabel = fuzzyScore(entry.label, q)
    const byPath = fuzzyScore(`${entry.path} ${entry.label}`, q)
    const best = Math.max(byLabel ?? -Infinity, byPath ?? -Infinity)
    if (best === -Infinity) continue
    // A label match outranks one that only fits once the menu path is included.
    out.push({ entry, enabled, score: byLabel === null ? best : best + 20 })
  }

  // Runnable commands first: an exact-looking match you cannot invoke is worse
  // than a slightly looser one you can.
  out.sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.score - a.score)
  return out.slice(0, 60)
})

/**
 * Every new result set starts at the top.
 *
 * Paired with `pointermove` rather than `pointerenter` on the rows: an overlay
 * opens under wherever the cursor happens to be resting, and `pointerenter`
 * fires on whatever row appears beneath it. That silently moved the selection
 * off the first result, so Enter ran a command the user had not looked at.
 */
watch(results, () => (selected.value = 0))

async function choose(index = selected.value): Promise<void> {
  const hit = results.value[index]
  if (!hit || !hit.enabled) return
  emit('close')
  await run(hit.entry.id)
}

/** Keeps the highlighted row in view when moving through a long list. */
async function scrollToSelected(): Promise<void> {
  await nextTick()
  list.value?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selected.value = Math.min(selected.value + 1, results.value.length - 1)
    void scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selected.value = Math.max(selected.value - 1, 0)
    void scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    void choose()
  }
}
</script>

<template>
  <div v-if="open" class="palette" @pointerdown.self="emit('close')">
    <div class="palette__panel" role="dialog" aria-label="Command palette" aria-modal="true">
      <input
        ref="input"
        v-model="query"
        class="palette__input"
        type="text"
        placeholder="Run a command…"
        aria-label="Command"
        @keydown="onKeydown"
      />

      <p v-if="results.length === 0" class="palette__empty">No matching command</p>

      <ul v-else ref="list" class="palette__list" role="listbox">
        <li
          v-for="(r, i) in results"
          :key="r.entry.id"
          class="palette__item"
          role="option"
          :aria-selected="i === selected"
          :aria-disabled="!r.enabled"
          :class="{ 'is-selected': i === selected, 'is-disabled': !r.enabled }"
          @pointermove="selected = i"
          @click="choose(i)"
        >
          <span class="palette__label">{{ r.entry.label }}</span>
          <span class="palette__path">{{ r.entry.path }}</span>
          <span v-if="r.entry.accel" class="palette__accel">{{ r.entry.accel }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.palette {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.35);
}
.palette__panel {
  width: min(620px, 90vw);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 8px;
  box-shadow: var(--menu-shadow);
  overflow: hidden;
}
.palette__input {
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--menu-border);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  outline: none;
}
.palette__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow: auto;
}
.palette__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 10px;
  padding: 5px 12px;
  cursor: default;
}
.palette__item.is-selected {
  background: var(--menu-hover);
}
.palette__item.is-disabled {
  opacity: 0.45;
}
.palette__label {
  font-size: 13px;
}
.palette__path {
  font-size: 11px;
  opacity: 0.6;
}
.palette__accel {
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.palette__empty {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
