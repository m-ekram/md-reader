<script setup lang="ts">
/**
 * A name typed in the tree, where the file or folder will appear: Enter makes
 * it, Escape or leaving the box does not.
 */
import { onMounted, ref } from 'vue'

const props = defineProps<{ depth: number; label: string; initial?: string }>()
const emit = defineEmits<{ commit: [name: string]; cancel: [] }>()

const input = ref<HTMLInputElement | null>(null)
let done = false

onMounted(() => {
  const el = input.value
  if (!el) return
  el.value = props.initial ?? ''
  el.focus()
  // The name without its extension, as Explorer selects it.
  const dot = el.value.lastIndexOf('.')
  el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
})

function finish(commit: boolean): void {
  if (done) return
  done = true
  if (commit) emit('commit', input.value?.value ?? '')
  else emit('cancel')
}
</script>

<template>
  <input
    ref="input"
    class="tree__name-input"
    :style="{ marginLeft: `${20 + depth * 12}px` }"
    :aria-label="label"
    spellcheck="false"
    @keydown.enter.prevent="finish(true)"
    @keydown.escape.prevent.stop="finish(false)"
    @blur="finish(false)"
  />
</template>

<style scoped>
.tree__name-input {
  display: block;
  width: calc(100% - 28px);
  margin: 1px 8px 1px 0;
  padding: 2px 4px;
  border: 1px solid var(--chrome-accent);
  border-radius: 3px;
  background: var(--doc-bg);
  color: var(--doc-fg);
  font: inherit;
  font-size: 12px;
}
</style>
