<script setup lang="ts">
/**
 * What replace across the folder would change, before it does: every file,
 * its number of matches and a few lines before and after, each with a box to
 * leave it out. Open documents are marked: they change in their tabs, unsaved.
 */
import { computed, nextTick, ref, watch } from 'vue'
import IconClose from './IconClose.vue'
import { applyFolderReplace, replaceState } from '../stores/replace'
import { useFocusTrap } from '../composables/useFocusTrap'

const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, () => replaceState.open)

const chosen = computed(() => replaceState.rows.filter((r) => r.chosen))
const total = computed(() => chosen.value.reduce((n, r) => n + r.count, 0))

watch(
  () => replaceState.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panel.value?.focus()
  }
)

function close(): void {
  replaceState.open = false
}
</script>

<template>
  <div v-if="replaceState.open" class="replace" @pointerdown.self="close">
    <div
      ref="panel"
      class="replace__panel"
      role="dialog"
      aria-modal="true"
      aria-label="Replace in folder"
      tabindex="-1"
      @keydown.escape.prevent="close"
    >
      <header class="replace__head">
        <h2>
          Replace “{{ replaceState.spec?.query }}” with “{{ replaceState.spec?.replacement }}”
        </h2>
        <button class="replace__close" aria-label="Close" @click="close"><IconClose /></button>
      </header>

      <p v-if="replaceState.loading" class="replace__note">Looking through the folder…</p>
      <p v-else-if="replaceState.rows.length === 0" class="replace__note">Nothing to replace.</p>
      <ul v-else class="replace__files">
        <li v-for="row in replaceState.rows" :key="row.path" class="replace__file">
          <label class="replace__name">
            <input v-model="row.chosen" type="checkbox" />
            <span>{{ row.relativePath }}</span>
            <span class="replace__count">{{ row.count }}</span>
            <span v-if="row.docId" class="replace__open">open, stays unsaved</span>
          </label>
          <div v-for="s in row.samples" :key="s.line" class="replace__sample">
            <span class="replace__line">{{ s.line }}</span>
            <del>{{ s.before.trim() }}</del>
            <ins>{{ s.after.trim() }}</ins>
          </div>
        </li>
      </ul>

      <footer class="replace__foot">
        <span class="replace__note">
          Each file changed on disk is kept first, in Help ▸ Data Recovery.
        </span>
        <button class="replace__btn" @click="close">Cancel</button>
        <button
          class="replace__btn replace__btn--go"
          :disabled="replaceState.loading || total === 0"
          @click="applyFolderReplace"
        >
          Replace {{ total }} in {{ chosen.length }} {{ chosen.length === 1 ? 'file' : 'files' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.replace {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  padding-top: 8vh;
  background: rgba(0, 0, 0, 0.35);
}
.replace__panel {
  display: flex;
  flex-direction: column;
  width: min(720px, 92vw);
  max-height: 80vh;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 8px;
  box-shadow: var(--menu-shadow);
  font-family: var(--ui-font);
  font-size: 13px;
  outline: none;
}
.replace__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--menu-border);
}
.replace__head h2 {
  flex: 1;
  margin: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.replace__close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
}
.replace__close:hover {
  background: var(--menu-hover);
}
.replace__files {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 6px 12px;
  list-style: none;
}
.replace__file {
  padding: 6px 0;
  border-bottom: 1px solid var(--menu-border);
}
.replace__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.replace__count {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--menu-hover);
  font-size: 11px;
}
.replace__open {
  color: var(--menu-fg-muted);
  font-size: 11px;
  font-weight: normal;
}
.replace__sample {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 0 6px;
  margin: 2px 0 0 22px;
  font-family: var(--code-font);
  font-size: 12px;
}
.replace__sample del,
.replace__sample ins {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}
.replace__sample del {
  color: var(--menu-fg-muted);
}
.replace__line {
  grid-row: span 2;
  color: var(--menu-fg-muted);
  text-align: right;
}
.replace__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--menu-border);
}
.replace__foot .replace__note {
  flex: 1;
}
.replace__note {
  margin: 0;
  padding: 12px;
  color: var(--menu-fg-muted);
  font-size: 12px;
}
.replace__foot .replace__note {
  padding: 0;
}
.replace__btn {
  padding: 5px 12px;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
}
/* As an option that is on: a tint and an outline, readable in every theme. */
.replace__btn--go {
  background: color-mix(in srgb, var(--chrome-accent) 18%, transparent);
  border-color: var(--chrome-accent);
  font-weight: 600;
}
.replace__btn:hover:not(:disabled) {
  background: var(--menu-hover);
}
.replace__btn:disabled {
  opacity: 0.5;
}
</style>
