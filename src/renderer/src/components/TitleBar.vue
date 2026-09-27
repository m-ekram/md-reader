<script setup lang="ts">
/**
 * Custom title bar. The window is frameless so the menu can be themed, which
 * means the caption buttons and drag region are ours to provide.
 */
import { onMounted, onBeforeUnmount, ref, computed, watch, watchEffect } from 'vue'
import { activeDoc, isDirty, useDocuments } from '../stores/documents'
import { useThemeStore } from '../stores/theme'
import MenuBar from './MenuBar.vue'
import logoMark from '../assets/logo-mark.png'

const docs = useDocuments()
const maximized = ref(false)
let stop: (() => void) | undefined

const title = computed(() => {
  const d = activeDoc.value
  if (!d) return 'ekram.md'
  return `${isDirty(d) ? '• ' : ''}${d.name} — ekram.md`
})

onMounted(() => {
  stop = window.api.window.onState((s) => (maximized.value = s.maximized))
})
onBeforeUnmount(() => stop?.())

/**
 * Keep the OS window title in step, for the taskbar and Alt-Tab.
 *
 * `watchEffect`, not `computed`: a computed is lazy, so one whose only purpose
 * is a side effect never runs if nothing reads it. That is exactly what
 * happened here — the title stayed at its initial value for the whole session.
 */
watchEffect(() => {
  document.title = title.value
})
void docs

// `window` does not resolve inside a Vue template, so the bridge is reached
// through component methods rather than directly in the markup.
/**
 * Whether Windows draws the caption buttons over this bar (see main's
 * `createWindow`). It does on Windows; there, the page leaves them room and
 * paints them in the theme's title bar colours.
 */
const systemCaptions =
  (navigator as { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay?.visible ??
  false

if (systemCaptions) {
  const themes = useThemeStore()
  watch(
    () => themes.applied,
    () => {
      const s = getComputedStyle(document.documentElement)
      window.api.window.captionColours(
        s.getPropertyValue('--chrome-bg').trim(),
        s.getPropertyValue('--chrome-fg').trim()
      )
    },
    { immediate: true }
  )
}

const minimize = () => window.api.window.minimize()
const toggleMaximize = () => window.api.window.toggleMaximize()
const close = () => window.api.window.close()
</script>

<template>
  <header class="titlebar" :class="{ 'titlebar--system-captions': systemCaptions }">
    <div class="titlebar__left">
      <!-- The window title already names the app, so the logo is decoration. -->
      <span class="titlebar__mark" aria-hidden="true">
        <img class="titlebar__logo" :src="logoMark" alt="" draggable="false" />
      </span>
      <MenuBar />
    </div>

    <div class="titlebar__drag">
      <span class="titlebar__title">{{ title }}</span>
    </div>

    <div v-if="!systemCaptions" class="titlebar__controls">
      <button class="cap" aria-label="Minimize" @click="minimize">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
      <button class="cap" :aria-label="maximized ? 'Restore' : 'Maximize'" @click="toggleMaximize">
        <svg v-if="!maximized" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
          <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button class="cap cap--close" aria-label="Close" @click="close">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
/*
 * Room for the caption buttons Windows draws over the bar's right-hand end:
 * everything right of the area it leaves the page.
 */
.titlebar--system-captions {
  padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw));
}
.titlebar {
  display: flex;
  align-items: stretch;
  height: 26px;
  background: var(--chrome-bg);
  color: var(--chrome-fg);
  border-bottom: 1px solid var(--chrome-border);
  -webkit-app-region: drag;
  flex: none;
}
.titlebar__left {
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
}
.titlebar__mark {
  display: grid;
  place-items: center;
  width: 30px;
}
/*
 * The logo on a small tile of its own paper colour. Most themes' title bars are
 * dark, and the logo's dark strokes would disappear on them; on the tile it
 * reads the same under every theme, in its own colours.
 */
.titlebar__logo {
  width: 18px;
  height: 18px;
  padding: 1px;
  border-radius: 4px;
  background: #fefdfb;
  box-sizing: border-box;
}
.titlebar__drag {
  flex: 1;
  display: grid;
  place-items: center;
  min-width: 0;
}
.titlebar__title {
  font-size: 12px;
  color: var(--chrome-fg-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.titlebar__controls {
  display: flex;
  -webkit-app-region: no-drag;
}
.cap {
  width: 42px;
  border: 0;
  background: transparent;
  color: var(--chrome-fg);
  display: grid;
  place-items: center;
  cursor: default;
}
.cap:hover {
  background: var(--chrome-hover);
}
.cap--close:hover {
  background: #c42b1c;
  color: #fff;
}
.cap:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: -2px;
}
</style>
