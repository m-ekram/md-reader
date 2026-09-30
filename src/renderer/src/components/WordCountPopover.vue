<script setup lang="ts">
/**
 * A fuller breakdown than the status bar carries.
 *
 * Counts are computed here rather than shared with the status bar because this
 * is open rarely, and the status bar deliberately keeps its own work minimal to
 * stay off the typing path.
 */
import IconClose from './IconClose.vue'
import { computed, ref } from 'vue'
import { activeDoc } from '../stores/documents'
import { uiState } from '../stores/ui'
import { useFocusTrap } from '../composables/useFocusTrap'

// Not modal, so Tab is free to leave; the focus still comes back on close.
const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, () => uiState.wordCountOpen, { trap: false })

const stats = computed(() => {
  const text = activeDoc.value?.content ?? ''
  const trimmed = text.trim()

  // Words split on whitespace; CJK is written without spaces, so those
  // characters are counted individually or a Japanese document reads as one
  // word. Unicode property escapes rather than hex ranges: the ranges contain
  // an ideographic space, which is invisible in source and easy to corrupt.
  const CJK = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u
  const latinWords = trimmed ? trimmed.split(/\s+/).filter((w) => !CJK.test(w)) : []
  const cjk = (text.match(/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/gu) ?? []).length

  return {
    words: latinWords.length + cjk,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    lines: text ? text.split('\n').length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length : 0,
    // 200 words per minute is the usual rule of thumb for prose.
    readingMinutes: Math.max(1, Math.round((latinWords.length + cjk) / 200)),
  }
})
</script>

<template>
  <div
    v-if="uiState.wordCountOpen"
    ref="panel"
    class="wordcount"
    role="dialog"
    aria-label="Word count"
    @keydown.escape="uiState.wordCountOpen = false"
  >
    <div class="wordcount__head">
      <span>{{ activeDoc?.name ?? 'No document' }}</span>
      <button aria-label="Close" @click="uiState.wordCountOpen = false"><IconClose /></button>
    </div>
    <dl class="wordcount__grid">
      <dt>Words</dt>
      <dd>{{ stats.words.toLocaleString() }}</dd>
      <dt>Characters</dt>
      <dd>{{ stats.characters.toLocaleString() }}</dd>
      <dt>Without spaces</dt>
      <dd>{{ stats.charactersNoSpaces.toLocaleString() }}</dd>
      <dt>Paragraphs</dt>
      <dd>{{ stats.paragraphs.toLocaleString() }}</dd>
      <dt>Lines</dt>
      <dd>{{ stats.lines.toLocaleString() }}</dd>
      <dt>Reading time</dt>
      <dd>{{ stats.readingMinutes }} min</dd>
    </dl>
  </div>
</template>

<style scoped>
.wordcount {
  position: absolute;
  right: 16px;
  bottom: 32px;
  z-index: 60;
  min-width: 220px;
  padding: 10px 12px;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 6px;
  box-shadow: var(--menu-shadow);
  font-size: 12px;
}
.wordcount__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--menu-border);
  font-weight: 600;
}
.wordcount__head button {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: default;
}
.wordcount__head button:hover {
  background: var(--menu-hover);
}
.wordcount__grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 16px;
  margin: 0;
}
.wordcount__grid dt {
  opacity: 0.7;
}
.wordcount__grid dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
