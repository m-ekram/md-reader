<script setup lang="ts">
/**
 * Open Quickly (Ctrl+P): fuzzy filename search over the workspace.
 *
 * Matching is subsequence-based so "frnt" finds "frontmatter.md", with scoring
 * that prefers matches at word boundaries and earlier in the name, and an exact
 * filename match always ranked first.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { openPath } from '../stores/documents'
import type { MarkdownFile } from '../../../main/workspace'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const ws = useWorkspace()
const query = ref('')
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)

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

interface Scored {
  file: MarkdownFile
  score: number
}

/**
 * Subsequence match with a score. Returns null when the pattern does not fit,
 * so the caller can drop the candidate entirely.
 */
function score(text: string, pattern: string): number | null {
  if (pattern.length === 0) return 0
  const lower = text.toLowerCase()
  let ti = 0
  let total = 0
  let streak = 0

  for (const ch of pattern) {
    const found = lower.indexOf(ch, ti)
    if (found < 0) return null

    // Consecutive characters and matches after a separator read as a better
    // match than characters scattered through the name.
    if (found === ti && ti > 0) streak++
    else streak = 0
    total += 10 + streak * 5
    if (found === 0 || /[\s\-_./\\]/.test(lower[found - 1] ?? '')) total += 8
    total -= Math.min(found - ti, 10)

    ti = found + 1
  }
  // Shorter names matching the same pattern are usually what was meant.
  return total - Math.min(text.length / 4, 15)
}

const results = computed<Scored[]>(() => {
  const q = query.value.trim().toLowerCase()
  const out: Scored[] = []

  for (const file of ws.articles) {
    if (q.length === 0) {
      out.push({ file, score: 0 })
      continue
    }
    // Score the name and the relative path, keeping whichever fits better, so
    // typing a folder name also finds files.
    const byName = score(file.name, q)
    const byPath = score(file.relativePath, q)
    const best = Math.max(byName ?? -Infinity, byPath ?? -Infinity)
    if (best === -Infinity) continue

    const nameNoExt = file.name.replace(/\.[^.]+$/, '').toLowerCase()
    const exact = nameNoExt === q || file.name.toLowerCase() === q
    out.push({ file, score: exact ? Number.MAX_SAFE_INTEGER : best })
  }

  out.sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name))
  return out.slice(0, 50)
})

watch(results, () => (selected.value = 0))

async function choose(index = selected.value): Promise<void> {
  const hit = results.value[index]
  if (!hit) return
  emit('close')
  await openPath(hit.file.path)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selected.value = Math.min(selected.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selected.value = Math.max(selected.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    void choose()
  }
}
</script>

<template>
  <div v-if="open" class="quick" @pointerdown.self="emit('close')">
    <div class="quick__panel" role="dialog" aria-label="Open Quickly" aria-modal="true">
      <input
        ref="input"
        v-model="query"
        class="quick__input"
        type="text"
        placeholder="Open quickly…"
        aria-label="File name"
        @keydown="onKeydown"
      />

      <p v-if="!ws.root" class="quick__empty">No folder open</p>
      <p v-else-if="results.length === 0" class="quick__empty">No matching files</p>

      <ul v-else class="quick__list" role="listbox">
        <li
          v-for="(r, i) in results"
          :key="r.file.path"
          class="quick__item"
          role="option"
          :aria-selected="i === selected"
          :class="{ 'is-selected': i === selected }"
          @pointerenter="selected = i"
          @click="choose(i)"
        >
          <span class="quick__name">{{ r.file.name }}</span>
          <span class="quick__path">{{ r.file.relativePath }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.quick {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.35);
}
.quick__panel {
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
.quick__input {
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--menu-border);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  outline: none;
}
.quick__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow: auto;
}
.quick__item {
  display: flex;
  flex-direction: column;
  padding: 5px 12px;
  cursor: default;
}
.quick__item.is-selected {
  background: var(--menu-hover);
}
.quick__name {
  font-size: 13px;
}
.quick__path {
  font-size: 11px;
  opacity: 0.6;
}
.quick__empty {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
