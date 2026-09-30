<script setup lang="ts">
/**
 * Help ▸ Data Recovery: the versions kept of the document in front, newest
 * first, and the one chosen shown against the text now, line by line.
 */
import { computed, nextTick, ref, watch } from 'vue'
import IconClose from './IconClose.vue'
import { currentText, historyState, restoreSelected, selectVersion } from '../stores/history'
import { diffLines } from '../utils/line-diff'
import { useFocusTrap } from '../composables/useFocusTrap'

const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, () => historyState.open)

watch(
  () => historyState.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panel.value?.querySelector<HTMLElement>('.history__version')?.focus()
  }
)

/** The version against the text now; null when too large to compare. */
const diff = computed(() =>
  historyState.content === null ? null : diffLines(currentText(), historyState.content)
)
const same = computed(() => historyState.content === currentText())

const when = (ms: number): string => new Date(ms).toLocaleString()
const size = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`

function close(): void {
  historyState.open = false
}

/** Up and down move through the versions, as in a list. */
function onListKeydown(e: KeyboardEvent): void {
  const i = historyState.versions.findIndex((v) => v.id === historyState.selected)
  const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : -2
  const next = historyState.versions[to]
  if (!next) return
  e.preventDefault()
  void selectVersion(next.id)
  void nextTick(() => panel.value?.querySelectorAll<HTMLElement>('.history__version')[to]?.focus())
}
</script>

<template>
  <div v-if="historyState.open" class="history" @pointerdown.self="close">
    <div
      ref="panel"
      class="history__panel"
      role="dialog"
      aria-modal="true"
      :aria-label="`Versions of ${historyState.name}`"
      @keydown.escape.prevent="close"
    >
      <header class="history__head">
        <h2>Versions of {{ historyState.name }}</h2>
        <button class="history__close" aria-label="Close" @click="close"><IconClose /></button>
      </header>

      <p v-if="historyState.versions.length === 0" class="history__note">
        No earlier version has been kept yet. One is kept each time the file is saved, so there will
        be one after the next save.
      </p>

      <div v-else class="history__body">
        <ul class="history__list" role="listbox" aria-label="Versions" @keydown="onListKeydown">
          <li
            v-for="(v, i) in historyState.versions"
            :key="v.id"
            class="history__version"
            role="option"
            :tabindex="v.id === historyState.selected ? 0 : -1"
            :aria-selected="v.id === historyState.selected"
            @click="selectVersion(v.id)"
          >
            <span class="history__when">{{ when(v.savedAtMs) }}</span>
            <span class="history__size"
              >{{ i === 0 ? 'before the last save · ' : '' }}{{ size(v.size) }}</span
            >
          </li>
        </ul>

        <div class="history__preview" aria-live="polite">
          <p v-if="historyState.content === null" class="history__note">Reading…</p>
          <p v-else-if="same" class="history__note">The same as the text now.</p>
          <pre v-else-if="diff" class="history__diff"><span
              v-for="(line, i) in diff"
              :key="i"
              :class="`history__line history__line--${line.kind}`"
            >{{ line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : '  ' }}{{ line.text }}</span
          ></pre>
          <pre v-else class="history__diff">{{ historyState.content }}</pre>
        </div>
      </div>

      <footer class="history__foot">
        <span class="history__note">
          <span class="history__key history__key--del">−</span> now,
          <span class="history__key history__key--add">+</span> in this version. Restoring does not
          save.
        </span>
        <button class="history__btn" @click="close">Cancel</button>
        <button
          class="history__btn history__btn--go"
          :disabled="historyState.content === null || same"
          @click="restoreSelected"
        >
          Restore this version
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.history {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  padding-top: 6vh;
  background: rgba(0, 0, 0, 0.35);
}
.history__panel {
  display: flex;
  flex-direction: column;
  width: min(900px, 94vw);
  height: min(640px, 84vh);
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 8px;
  box-shadow: var(--menu-shadow);
  font-family: var(--ui-font);
  font-size: 13px;
}
.history__head {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--menu-border);
}
.history__head h2 {
  flex: 1;
  margin: 0;
  font-size: 14px;
}
.history__close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
}
.history__close:hover {
  background: var(--menu-hover);
}
.history__body {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 0;
}
.history__list {
  margin: 0;
  padding: 4px 0;
  overflow: auto;
  list-style: none;
  border-right: 1px solid var(--menu-border);
}
.history__version {
  display: flex;
  flex-direction: column;
  padding: 6px 12px;
  cursor: default;
  outline: none;
}
.history__version[aria-selected='true'] {
  background: var(--menu-hover);
  box-shadow: inset 2px 0 0 var(--chrome-accent);
}
.history__version:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}
.history__size {
  color: var(--menu-fg-muted);
  font-size: 11px;
}
.history__preview {
  overflow: auto;
  min-width: 0;
}
.history__diff {
  margin: 0;
  padding: 8px 12px;
  font-family: var(--code-font);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.history__line {
  display: block;
}
.history__line--add,
.history__key--add {
  background: color-mix(in srgb, var(--alert-tip, #2da44e) 18%, transparent);
}
.history__line--del,
.history__key--del {
  background: color-mix(in srgb, var(--alert-caution, #cf222e) 18%, transparent);
}
.history__key {
  padding: 0 4px;
  border-radius: 3px;
}
.history__note {
  margin: 0;
  padding: 12px;
  color: var(--menu-fg-muted);
  font-size: 12px;
}
.history__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--menu-border);
}
.history__foot .history__note {
  flex: 1;
  padding: 0;
}
.history__btn {
  padding: 5px 12px;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
}
.history__btn--go {
  background: color-mix(in srgb, var(--chrome-accent) 18%, transparent);
  border-color: var(--chrome-accent);
  font-weight: 600;
}
.history__btn:hover:not(:disabled) {
  background: var(--menu-hover);
}
.history__btn:disabled {
  opacity: 0.5;
}
</style>
