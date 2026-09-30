<script setup lang="ts">
/** Paper, orientation, margins and page numbers, asked before each Export PDF. */
import { nextTick, ref, watch } from 'vue'
import IconClose from './IconClose.vue'
import { answerPageSetup, pageSetupState } from '../stores/page-setup'
import { PAGE_SIZES } from '../../../shared/page-setup'
import { useFocusTrap } from '../composables/useFocusTrap'

const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, () => pageSetupState.open)

watch(
  () => pageSetupState.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panel.value?.querySelector<HTMLElement>('select')?.focus()
  }
)

const margins = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
] as const
</script>

<template>
  <div v-if="pageSetupState.open" class="setup" @pointerdown.self="answerPageSetup(false)">
    <form
      ref="panel"
      class="setup__panel"
      role="dialog"
      aria-modal="true"
      aria-label="Page setup"
      @submit.prevent="answerPageSetup(true)"
      @keydown.escape.prevent="answerPageSetup(false)"
    >
      <header class="setup__head">
        <h2>Page setup</h2>
        <button
          type="button"
          class="setup__close"
          aria-label="Close"
          @click="answerPageSetup(false)"
        >
          <IconClose />
        </button>
      </header>

      <label class="setup__row">
        <span>Paper</span>
        <select v-model="pageSetupState.setup.pageSize" aria-label="Paper">
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <fieldset class="setup__row">
        <legend>Orientation</legend>
        <label>
          <input v-model="pageSetupState.setup.landscape" type="radio" :value="false" />
          Portrait
        </label>
        <label>
          <input v-model="pageSetupState.setup.landscape" type="radio" :value="true" />
          Landscape
        </label>
      </fieldset>

      <label class="setup__row">
        <span>Margins</span>
        <select v-model="pageSetupState.setup.margin" aria-label="Margins">
          <option v-for="m in margins" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </label>

      <label class="setup__row setup__row--check">
        <input v-model="pageSetupState.setup.pageNumbers" type="checkbox" />
        Page numbers
      </label>

      <footer class="setup__foot">
        <button type="button" class="setup__btn" @click="answerPageSetup(false)">Cancel</button>
        <button type="submit" class="setup__btn setup__btn--go">Export</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.setup {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
  background: rgba(0, 0, 0, 0.35);
}
.setup__panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, 92vw);
  padding: 0 0 12px;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 8px;
  box-shadow: var(--menu-shadow);
  font-family: var(--ui-font);
  font-size: 13px;
}
.setup__head {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--menu-border);
}
.setup__head h2 {
  flex: 1;
  margin: 0;
  font-size: 14px;
}
.setup__close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
}
.setup__close:hover {
  background: var(--menu-hover);
}
.setup__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 16px;
  padding: 0;
  border: 0;
}
.setup__row > span,
.setup__row > legend {
  width: 90px;
  float: left;
  padding: 0;
}
.setup__row select {
  flex: 1;
  padding: 3px 6px;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  background: var(--doc-bg);
  color: var(--doc-fg);
  font: inherit;
}
.setup__row--check {
  padding-left: 102px;
}
.setup__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 4px 16px 0;
}
.setup__btn {
  padding: 5px 14px;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
}
.setup__btn--go {
  background: color-mix(in srgb, var(--chrome-accent) 18%, transparent);
  border-color: var(--chrome-accent);
  font-weight: 600;
}
.setup__btn:hover {
  background: var(--menu-hover);
}
</style>
