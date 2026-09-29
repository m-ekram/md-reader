<script setup lang="ts">
/**
 * What a window shows with no document open: at launch, when there was no
 * last session to reopen, and after the last tab closes.
 *
 * It used to be a blank Untitled document, which had to be closed or typed
 * over to get to a file. New is focused, so Enter starts writing as quickly as
 * the blank document did. Recent files come from the same list, and run the
 * same commands, as File ▸ Open Recent.
 */
import { computed, onMounted, ref } from 'vue'
import { run } from '../commands/registry'
import { EXTRA_ACCELERATORS, flattenMenu } from '../commands/menus'
import { useSettingsStore } from '../stores/settings'
import logoMark from '../assets/logo-mark.png'

/** As many as fit without scrolling in the smallest window. */
const SHOWN_RECENT = 8

const settings = useSettingsStore()
const actionsEl = ref<HTMLElement | null>(null)

const accels = new Map([
  ...flattenMenu().map((i) => [i.id, i.accel] as const),
  ...EXTRA_ACCELERATORS.map((e) => [e.id, e.accel] as const),
])

const actions = [
  { id: 'file.new', label: 'New document' },
  { id: 'file.open', label: 'Open file…' },
  { id: 'file.openFolder', label: 'Open folder…' },
].map((a) => ({ ...a, accel: accels.get(a.id) }))

/**
 * Where to go next. A first launch offered New, Open and Open Folder, and
 * nothing about finding the rest.
 */
const paletteAccel = accels.get('app.commandPalette')

const recent = computed(() =>
  settings.value.recentFiles.slice(0, SHOWN_RECENT).map((path, i) => {
    const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
    return {
      id: `file.recent.${i}`,
      path,
      name: path.slice(cut + 1),
      folder: cut > 0 ? path.slice(0, cut) : '',
    }
  })
)

onMounted(() => actionsEl.value?.querySelector('button')?.focus())
</script>

<template>
  <section class="welcome" aria-label="Welcome">
    <div class="welcome__inner">
      <header class="welcome__head">
        <img class="welcome__logo" :src="logoMark" alt="" draggable="false" />
        <h1 class="welcome__title">ekram.md</h1>
      </header>

      <div ref="actionsEl" class="welcome__actions">
        <button v-for="a in actions" :key="a.id" class="welcome__action" @click="run(a.id)">
          <span>{{ a.label }}</span>
          <kbd v-if="a.accel" class="welcome__accel">{{ a.accel }}</kbd>
        </button>
      </div>

      <ul class="welcome__tips" aria-label="Tips">
        <li>
          <button class="welcome__tip" @click="run('app.commandPalette')">
            Find any command
            <kbd v-if="paletteAccel" class="welcome__accel">{{ paletteAccel }}</kbd>
          </button>
        </li>
        <li class="welcome__tip welcome__tip--text">
          Type <kbd class="welcome__key">/</kbd> on an empty line for headings, tables and more
        </li>
        <li>
          <button class="welcome__tip" @click="run('help.quickStart')">Quick Start guide</button>
        </li>
      </ul>

      <div v-if="recent.length > 0" class="welcome__recent">
        <h2 class="welcome__heading">Recent</h2>
        <ul class="welcome__list">
          <li v-for="r in recent" :key="r.path">
            <button class="welcome__file" :title="r.path" @click="run(r.id)">
              <span class="welcome__name">{{ r.name }}</span>
              <span class="welcome__folder">{{ r.folder }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 32px 16px;
  color: var(--doc-fg);
  overflow: auto;
}
.welcome__inner {
  width: min(420px, 100%);
}
.welcome__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}
.welcome__logo {
  width: 32px;
  height: 32px;
  padding: 2px;
  border-radius: 7px;
  /* The title bar's tile, so the mark reads the same on dark themes. */
  background: #fefdfb;
  box-sizing: border-box;
}
.welcome__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.welcome__actions {
  display: grid;
  gap: 4px;
}
.welcome__action,
.welcome__file {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.welcome__action:hover,
.welcome__file:hover,
.welcome__action:focus-visible,
.welcome__file:focus-visible {
  background: color-mix(in srgb, var(--doc-fg) 8%, transparent);
  outline: none;
}
.welcome__action:focus-visible,
.welcome__file:focus-visible {
  box-shadow: inset 0 0 0 1px var(--doc-accent);
}
.welcome__accel {
  margin-left: auto;
  font-family: inherit;
  font-size: 12px;
  color: var(--doc-muted);
}
.welcome__tips {
  display: grid;
  gap: 2px;
  margin: 16px 0 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--doc-rule);
  list-style: none;
}
.welcome__tip {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--doc-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
button.welcome__tip:hover,
button.welcome__tip:focus-visible {
  background: color-mix(in srgb, var(--doc-fg) 8%, transparent);
  color: var(--doc-fg);
  outline: none;
}
.welcome__tip--text {
  display: block;
  cursor: default;
}
.welcome__key {
  padding: 0 5px;
  border: 1px solid var(--doc-rule);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
}
.welcome__recent {
  margin-top: 28px;
}
.welcome__heading {
  margin: 0 0 6px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--doc-muted);
}
.welcome__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.welcome__name {
  flex: none;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.welcome__folder {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--doc-muted);
}
</style>
