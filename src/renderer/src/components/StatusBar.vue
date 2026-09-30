<script setup lang="ts">
/**
 * Status bar. Beyond counts, this is where the round-trip warning surfaces —
 * visible but non-blocking, so the user learns a file is risky before they
 * commit to editing it, without a modal interrupting them.
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { activeDoc, isDirty } from '../stores/documents'
import { run } from '../commands/registry'
import { setFontSize, stepFontSize, useSettingsStore } from '../stores/settings'
import { useThemeStore } from '../stores/theme'
import { FONT_MAX, FONT_MIN, effectiveFontSize } from '../stores/appearance'

const settings = useSettingsStore()
const theme = useThemeStore()

/** The text size showing now: the reader's, or the current theme's. */
const fontSize = computed(() => {
  void theme.current // A theme switch changes the default.
  return effectiveFontSize(settings.value.editor)
})

/**
 * Counting words means walking the whole document. Doing that synchronously on
 * every keystroke puts an O(document) cost on the typing path, which is exactly
 * where the measurements say we have the least headroom. Trailing debounce.
 */
const counts = ref({ words: 0, chars: 0, lines: 0 })
let timer: number | undefined

function recount(text: string): void {
  counts.value = {
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    chars: text.length,
    lines: text ? text.split('\n').length : 0,
  }
}

watch(
  () => activeDoc.value?.content ?? '',
  (text) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => recount(text), 200)
  },
  { immediate: true }
)

onBeforeUnmount(() => window.clearTimeout(timer))

const large = computed(() => {
  if (!activeDoc.value || activeDoc.value.sourceMode) return false
  return counts.value.lines > settings.value.editor.sourceModeOfferLines
})

const eolLabel = computed(() => (activeDoc.value?.eol === '\r\n' ? 'CRLF' : 'LF'))
</script>

<template>
  <footer v-if="settings.statusBar" class="status">
    <div class="status__left">
      <!--
        Only in the formatted view, which is what lags; and it is the way out.
        Beside the other warnings rather than instead of them, and first, as the
        short one: a file this long often also carries the round-trip warning.
      -->
      <button
        v-if="large"
        class="warn warn--action"
        title="Switch to source view (Ctrl+/)"
        @click="run('view.sourceMode')"
      >
        ⚠ {{ counts.lines.toLocaleString() }} lines, typing may lag: source view
      </button>
      <!--
        The file was deleted, or moved outside anything we could follow, while
        its tab was open. The tab keeps its content — closing it would destroy
        work every time a sync client briefly removed a file — so this line is
        the only way the user learns the file on disk is gone.
      -->
      <span v-if="activeDoc?.detached" class="warn detached">
        ⚠ This file was deleted from disk. Saving will create it again.
      </span>
      <span v-else-if="activeDoc?.lossy?.lossy" class="warn" :title="activeDoc.lossy.note">
        ⚠ {{ activeDoc.lossy.note }}
      </span>
    </div>

    <div class="status__right">
      <!-- Text size. The same setting as View ▸ Zoom and Ctrl+wheel. -->
      <span class="size" role="group" aria-label="Text size">
        <button
          class="size__btn"
          title="Smaller text (Ctrl+Shift+-)"
          aria-label="Smaller text"
          :disabled="fontSize <= FONT_MIN"
          @click="stepFontSize(-1)"
        >
          A−
        </button>
        <button
          class="size__value"
          :title="
            settings.editor.fontSize === null
              ? 'Text size (theme default)'
              : 'Reset to the theme’s size'
          "
          @click="setFontSize(null)"
        >
          {{ fontSize }}px
        </button>
        <button
          class="size__btn"
          title="Larger text (Ctrl+Shift+=)"
          aria-label="Larger text"
          :disabled="fontSize >= FONT_MAX"
          @click="stepFontSize(1)"
        >
          A+
        </button>
      </span>
      <template v-if="activeDoc">
        <span>{{ counts.words }} words</span>
        <span>{{ counts.chars }} chars</span>
        <span>{{ counts.lines }} lines</span>
        <span>{{ eolLabel }}</span>
        <span>{{ activeDoc.encoding.toUpperCase() }}{{ activeDoc.hasBom ? ' BOM' : '' }}</span>
        <span v-if="isDirty(activeDoc)" class="dirty">Unsaved</span>
      </template>
    </div>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  height: 24px;
  padding: 0 12px;
  align-items: center;
  background: var(--status-bg);
  color: var(--status-fg);
  border-top: 1px solid var(--doc-rule);
  font-size: 12px;
  flex: none;
}
.status__right {
  display: flex;
  gap: 14px;
}
.status__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}
.status__left > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.size {
  display: flex;
  align-items: center;
}
.size__btn,
.size__value {
  height: 18px;
  padding: 0 5px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: default;
}
.size__value {
  min-width: 38px;
  font-variant-numeric: tabular-nums;
}
.size__btn:hover:not(:disabled),
.size__value:hover {
  background: var(--doc-rule);
}
.size__btn:disabled {
  opacity: 0.4;
}
.warn {
  color: var(--warning);
}
.warn--action {
  flex: none;
  padding: 0 4px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  font: inherit;
  cursor: default;
}
.warn--action:hover {
  background: var(--doc-rule);
}
.dirty {
  color: var(--doc-accent);
}
</style>
