<script setup lang="ts">
/**
 * The find and replace bar, floating over the top of the document.
 *
 * Deliberately not a modal: you need to see the matches highlighted in the text
 * while typing the query.
 */
import { nextTick, ref, watch } from 'vue'
import { applyQuery, closeFind, find, findState } from '../editor/find'

const input = ref<HTMLInputElement | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)
let debounce: number | undefined

watch(
  () => findState.open,
  async (open) => {
    if (!open) return
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
)

// Debounced: every keystroke otherwise re-scans the whole document to count
// matches, which is the one operation here that grows with document size.
watch(
  () => [findState.query, findState.caseSensitive, findState.wholeWord],
  () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(applyQuery, 150)
  }
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeFind()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) find.previous()
    else find.next()
  }
}

function onReplaceKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeFind()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (e.ctrlKey) find.replaceEverything()
    else find.replaceAndAdvance()
  }
}

async function toggleReplace(): Promise<void> {
  findState.replaceMode = !findState.replaceMode
  if (!findState.replaceMode) return
  await nextTick()
  replaceInput.value?.focus()
}
</script>

<template>
  <div v-if="findState.open" class="find" role="search" aria-label="Find in document">
    <div class="find__row">
      <button
        class="find__toggle"
        :aria-expanded="findState.replaceMode"
        :title="findState.replaceMode ? 'Hide replace' : 'Show replace'"
        @click="toggleReplace"
      >
        {{ findState.replaceMode ? '▾' : '▸' }}
      </button>

      <input
        ref="input"
        v-model="findState.query"
        class="find__input"
        type="text"
        placeholder="Find"
        aria-label="Find"
        @keydown="onKeydown"
      />

      <span class="find__count" aria-live="polite">
        <template v-if="findState.query.length === 0">&nbsp;</template>
        <template v-else-if="findState.matches === 0">No results</template>
        <template v-else>{{ findState.current || '?' }} of {{ findState.matches }}</template>
      </span>

      <button
        class="find__opt"
        :class="{ 'is-on': findState.caseSensitive }"
        title="Match case"
        aria-label="Match case"
        @click="findState.caseSensitive = !findState.caseSensitive"
      >
        Aa
      </button>
      <button
        class="find__opt"
        :class="{ 'is-on': findState.wholeWord }"
        title="Whole word"
        aria-label="Whole word"
        @click="findState.wholeWord = !findState.wholeWord"
      >
        ab
      </button>

      <button class="find__btn" title="Previous (Shift+Enter)" @click="find.previous()">↑</button>
      <button class="find__btn" title="Next (Enter)" @click="find.next()">↓</button>
      <button class="find__btn" title="Close (Escape)" @click="closeFind()">✕</button>
    </div>

    <div v-if="findState.replaceMode" class="find__row">
      <span class="find__toggle" aria-hidden="true" />
      <input
        ref="replaceInput"
        v-model="findState.replacement"
        class="find__input"
        type="text"
        placeholder="Replace with"
        aria-label="Replace with"
        @keydown="onReplaceKeydown"
      />
      <span class="find__count">&nbsp;</span>
      <button class="find__wide" @click="find.replaceAndAdvance()">Replace</button>
      <button class="find__wide" @click="find.replaceEverything()">All</button>
    </div>
  </div>
</template>

<style scoped>
.find {
  position: absolute;
  top: 8px;
  right: 20px;
  z-index: 50;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 6px;
  box-shadow: var(--menu-shadow);
}
.find__row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.find__input {
  width: 190px;
  padding: 3px 6px;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  background: var(--doc-bg);
  color: var(--doc-fg);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.find__input:focus {
  border-color: var(--doc-accent);
}
.find__count {
  min-width: 68px;
  font-size: 11px;
  opacity: 0.7;
  text-align: center;
}
.find__toggle,
.find__opt,
.find__btn,
.find__wide {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: default;
  border-radius: 4px;
  padding: 3px 6px;
}
.find__toggle {
  width: 20px;
}
.find__opt.is-on {
  background: var(--doc-accent);
  color: #fff;
}
.find__opt:hover,
.find__btn:hover,
.find__wide:hover,
.find__toggle:hover {
  background: var(--menu-hover);
}
.find__wide {
  border: 1px solid var(--menu-border);
}
.find__opt:focus-visible,
.find__btn:focus-visible,
.find__wide:focus-visible,
.find__toggle:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}
</style>
