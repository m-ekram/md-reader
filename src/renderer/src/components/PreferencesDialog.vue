<script setup lang="ts">
/**
 * Preferences (Ctrl+,).
 *
 * Every control writes through `patchSettings` immediately rather than
 * collecting changes behind an OK button. Settings live in main and are
 * broadcast to every window, so a deferred apply would mean holding a second,
 * divergent copy of them here and reconciling it — and a preference that takes
 * effect as you change it is easier to understand than one that does not.
 *
 * The dialog is a view over the settings store, so anything changed elsewhere
 * — the Themes menu, a View toggle — is reflected here without wiring.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { patchSettings, setContentWidth, setFontSize, useSettingsStore } from '../stores/settings'
import { useThemeStore } from '../stores/theme'
import { chooseTheme } from '../stores/system-theme'
import { setPunctuation } from '../editor/punctuation'
import { setShowWhitespace } from '../editor/whitespace'
import { setEditorModes } from '../editor/typewriter'
import { invalidateCommands } from '../commands/registry'
import { refreshDecorations } from '../editor/view'
import {
  FONT_MAX,
  FONT_MIN,
  WIDTH_MAX,
  WIDTH_MIN,
  effectiveFontSize,
  validWidth,
} from '../stores/appearance'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const themes = useThemeStore()
const panel = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    // Focus moves into the dialog so Escape and Tab behave, and so a screen
    // reader announces it rather than leaving the caret in the document.
    panel.value?.focus()
  }
)

const editor = computed(() => settings.value.editor)

/** Patches one editor field, keeping the rest of the group intact. */
async function patchEditor(patch: Partial<typeof settings.value.editor>): Promise<void> {
  await patchSettings({ editor: { ...settings.value.editor, ...patch } })
  invalidateCommands()
}

/** The text size showing now, which follows the theme until one is chosen. */
const fontSize = computed(() => {
  void themes.current
  return effectiveFontSize(settings.value.editor)
})

/**
 * Width is one of three kinds — the theme's, a pixel value, or the whole pane —
 * so the kind is chosen first and the slider appears only for pixels.
 */
const width = computed(() => validWidth(editor.value.contentWidth))
const widthKind = computed(() =>
  width.value === null ? 'theme' : width.value === 'full' ? 'full' : 'custom'
)
/** A custom width starts from the column as it is now, not from an arbitrary number. */
function currentColumnWidth(): number {
  const col = document.querySelector('.editor-host') as HTMLElement | null
  // The content box, which is what max-width limits; the padding is extra.
  const px = col ? parseFloat(getComputedStyle(col).width) : NaN
  return Number.isFinite(px) ? px : 900
}
async function setWidthKind(kind: string): Promise<void> {
  if (kind === 'theme') await setContentWidth(null)
  else if (kind === 'full') await setContentWidth('full')
  else await setContentWidth(currentColumnWidth())
}

function setTheme(id: string): Promise<void> {
  return chooseTheme(id)
}

/**
 * Applied to the live editor as well as stored.
 *
 * These three have a runtime counterpart that is read per keystroke, so
 * storing alone would leave the setting and the behaviour disagreeing until
 * the next launch.
 */
async function setQuotes(value: boolean): Promise<void> {
  setPunctuation({ quotes: value })
  await patchEditor({ smartQuotes: value })
}
async function setDashes(value: boolean): Promise<void> {
  setPunctuation({ dashes: value })
  await patchEditor({ smartDashes: value })
}
async function setEllipses(value: boolean): Promise<void> {
  setPunctuation({ ellipses: value })
  await patchEditor({ smartEllipses: value })
}

async function setWhitespace(value: boolean): Promise<void> {
  setShowWhitespace(value)
  refreshDecorations()
  await patchEditor({ showWhitespace: value })
}

async function setTypewriter(value: boolean): Promise<void> {
  setEditorModes({ typewriter: value })
  await patchEditor({ typewriter: value })
}
async function setFocusMode(value: boolean): Promise<void> {
  setEditorModes({ focus: value })
  refreshDecorations()
  await patchEditor({ focusMode: value })
}

async function setSpellcheck(value: boolean): Promise<void> {
  window.api.window.setSpellcheck(value)
  await patchEditor({ spellcheck: value })
}

/**
 * Clamped on the way in.
 *
 * A number field accepts anything typed into it, and a live-editor cap of zero
 * or a threshold of minus one would break the feature it configures rather
 * than merely configuring it oddly.
 */
function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

async function setLiveEditors(raw: number): Promise<void> {
  await patchEditor({ liveEditors: clamp(raw, 1, 30, 5) })
}

async function setOfferLines(raw: number): Promise<void> {
  const offer = clamp(raw, 100, 1_000_000, 5000)
  // Forcing source mode below the line where it is merely offered would mean
  // never offering it at all.
  const force = Math.max(offer, settings.value.editor.sourceModeForceLines)
  await patchEditor({ sourceModeOfferLines: offer, sourceModeForceLines: force })
}

async function setForceLines(raw: number): Promise<void> {
  const force = clamp(raw, 100, 1_000_000, 10000)
  const offer = Math.min(force, settings.value.editor.sourceModeOfferLines)
  await patchEditor({ sourceModeForceLines: force, sourceModeOfferLines: offer })
}

/**
 * The assets folder is free text, so it is validated before it is stored.
 *
 * A rejected value is put back to what is stored rather than silently ignored:
 * leaving the typed text in the field shows the user a setting that is not in
 * force anywhere.
 */
async function setAssetsFolder(el: HTMLInputElement): Promise<void> {
  const cleaned = el.value.trim().replace(/^[\\/]+|[\\/]+$/g, '')
  // An empty or escaping value would write pasted images somewhere other than
  // beside the document, which is the one thing this setting must not do.
  if (!cleaned || /^[a-zA-Z]:/.test(cleaned) || cleaned.includes('..')) {
    el.value = settings.value.editor.assetsFolder
    return
  }
  el.value = cleaned
  await patchEditor({ assetsFolder: cleaned })
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !props.open) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

/**
 * Listened for on the window rather than only on the panel.
 *
 * Focus leaves the panel as soon as a field is blurred, and a modal that stops
 * responding to Escape because the caret moved is a trap.
 */
watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown, true)
    else window.removeEventListener('keydown', onKeydown, true)
  }
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div v-if="open" class="prefs" @pointerdown.self="emit('close')">
    <div
      ref="panel"
      class="prefs__panel"
      role="dialog"
      aria-label="Preferences"
      aria-modal="true"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <header class="prefs__head">
        <h2>Preferences</h2>
        <button class="prefs__close" aria-label="Close" @click="emit('close')">✕</button>
      </header>

      <div class="prefs__body">
        <section class="prefs__section">
          <h3>Appearance</h3>

          <label v-if="!settings.followSystem.enabled" class="row">
            <span class="row__label">Theme</span>
            <select
              class="row__control"
              :value="themes.current"
              @change="setTheme(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="t in themes.available" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
          </label>
          <template v-else>
            <label v-for="mode in ['light', 'dark'] as const" :key="mode" class="row">
              <span class="row__label">{{ mode === 'light' ? 'Light theme' : 'Dark theme' }}</span>
              <select
                class="row__control"
                :value="settings.followSystem[mode]"
                @change="
                  patchSettings({
                    followSystem: {
                      ...settings.followSystem,
                      [mode]: ($event.target as HTMLSelectElement).value,
                    },
                  })
                "
              >
                <option v-for="t in themes.available" :key="t.id" :value="t.id">
                  {{ t.name }}
                </option>
              </select>
            </label>
          </template>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="settings.followSystem.enabled"
              @change="
                patchSettings({
                  followSystem: {
                    ...settings.followSystem,
                    enabled: ($event.target as HTMLInputElement).checked,
                  },
                })
              "
            />
            <span>Match Windows light or dark mode</span>
          </label>

          <div class="row">
            <span class="row__label">Text size</span>
            <input
              class="row__control row__control--num"
              type="number"
              :min="FONT_MIN"
              :max="FONT_MAX"
              :value="fontSize"
              aria-label="Text size in pixels"
              @change="setFontSize(Number(($event.target as HTMLInputElement).value) || null)"
            />
            <span class="row__unit">px</span>
            <button
              class="row__reset"
              :disabled="editor.fontSize === null"
              title="Use the theme’s text size"
              @click="setFontSize(null)"
            >
              Reset
            </button>
          </div>

          <label class="row">
            <span class="row__label">Content width</span>
            <select
              class="row__control"
              :value="widthKind"
              aria-label="Content width"
              @change="setWidthKind(($event.target as HTMLSelectElement).value)"
            >
              <option value="theme">Theme default</option>
              <option value="custom">Custom</option>
              <option value="full">Full width</option>
            </select>
          </label>

          <label v-if="typeof width === 'number'" class="row">
            <input
              class="row__slider"
              type="range"
              :min="WIDTH_MIN"
              :max="WIDTH_MAX"
              step="20"
              :value="width"
              aria-label="Content width in pixels"
              @input="setContentWidth(Number(($event.target as HTMLInputElement).value))"
            />
            <span class="row__value">{{ width }} px</span>
          </label>
          <p class="hint">
            View ▸ Zoom and Ctrl+wheel change the text size too. Exports keep the theme’s layout.
          </p>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="settings.statusBar"
              @change="patchSettings({ statusBar: ($event.target as HTMLInputElement).checked })"
            />
            <span>Show status bar</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="settings.toolbar"
              @change="patchSettings({ toolbar: ($event.target as HTMLInputElement).checked })"
            />
            <span>Show toolbar</span>
          </label>
        </section>

        <section class="prefs__section">
          <h3>Files</h3>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="settings.session.restore"
              @change="
                patchSettings({
                  session: {
                    ...settings.session,
                    restore: ($event.target as HTMLInputElement).checked,
                  },
                })
              "
            />
            <span>Reopen documents from last time</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="settings.autoSave"
              @change="patchSettings({ autoSave: ($event.target as HTMLInputElement).checked })"
            />
            <span>Save automatically</span>
          </label>
          <p class="hint">
            Files are saved a moment after you stop typing, and when you switch away. New documents
            still ask for a name.
          </p>
        </section>

        <section class="prefs__section">
          <h3>Editing</h3>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.spellcheck"
              @change="setSpellcheck(($event.target as HTMLInputElement).checked)"
            />
            <span>Check spelling</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.showWhitespace"
              @change="setWhitespace(($event.target as HTMLInputElement).checked)"
            />
            <span>Show whitespace</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.focusMode"
              @change="setFocusMode(($event.target as HTMLInputElement).checked)"
            />
            <span>Focus mode</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.typewriter"
              @change="setTypewriter(($event.target as HTMLInputElement).checked)"
            />
            <span>Typewriter scrolling</span>
          </label>
        </section>

        <section class="prefs__section">
          <h3>Smart punctuation</h3>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.smartQuotes"
              @change="setQuotes(($event.target as HTMLInputElement).checked)"
            />
            <span>Curly quotes</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.smartDashes"
              @change="setDashes(($event.target as HTMLInputElement).checked)"
            />
            <span>En and em dashes</span>
          </label>

          <label class="row row--check">
            <input
              type="checkbox"
              :checked="editor.smartEllipses"
              @change="setEllipses(($event.target as HTMLInputElement).checked)"
            />
            <span>Ellipses</span>
          </label>
        </section>

        <section class="prefs__section">
          <h3>Images</h3>

          <label class="row">
            <span class="row__label">Assets folder</span>
            <input
              class="row__control"
              type="text"
              :value="editor.assetsFolder"
              @change="setAssetsFolder($event.target as HTMLInputElement)"
            />
          </label>
          <p class="hint">
            Pasted images are written here, beside the document, and linked by relative path.
          </p>
        </section>

        <section class="prefs__section">
          <h3>Large documents</h3>

          <label class="row">
            <span class="row__label">Offer source mode above</span>
            <input
              class="row__control row__control--num"
              type="number"
              min="100"
              step="500"
              :value="editor.sourceModeOfferLines"
              @change="setOfferLines(Number(($event.target as HTMLInputElement).value))"
            />
          </label>

          <label class="row">
            <span class="row__label">Default to source mode above</span>
            <input
              class="row__control row__control--num"
              type="number"
              min="100"
              step="500"
              :value="editor.sourceModeForceLines"
              @change="setForceLines(Number(($event.target as HTMLInputElement).value))"
            />
          </label>

          <label class="row">
            <span class="row__label">Editors kept in memory</span>
            <input
              class="row__control row__control--num"
              type="number"
              min="1"
              max="30"
              :value="editor.liveEditors"
              @change="setLiveEditors(Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <p class="hint">
            Each one keeps a tab's undo history alive across switches, and costs memory.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prefs {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  padding-top: 8vh;
  background: rgba(0, 0, 0, 0.35);
}
.prefs__panel {
  width: min(560px, 92vw);
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: var(--menu-bg);
  color: var(--menu-fg);
  border: 1px solid var(--menu-border);
  border-radius: 8px;
  box-shadow: var(--menu-shadow);
  overflow: hidden;
  outline: none;
}
.prefs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--menu-border);
}
.prefs__head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.prefs__close {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: default;
}
.prefs__body {
  overflow: auto;
  padding: 4px 16px 16px;
}
.prefs__section {
  padding: 12px 0;
  border-bottom: 1px solid var(--menu-border);
}
.prefs__section:last-child {
  border-bottom: 0;
}
.prefs__section h3 {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.6;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
}
.row--check {
  justify-content: flex-start;
  gap: 8px;
}
.row__label {
  flex: 1;
}
.row__control {
  min-width: 170px;
  padding: 4px 6px;
  background: var(--menu-hover);
  color: inherit;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  font: inherit;
  font-size: 12px;
}
.row__control--num {
  min-width: 90px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.row__unit {
  margin-left: -6px;
  opacity: 0.7;
}
.row__reset {
  padding: 3px 8px;
  background: transparent;
  color: inherit;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  font: inherit;
  font-size: 12px;
  cursor: default;
}
.row__reset:disabled {
  opacity: 0.4;
}
.row__slider {
  flex: 1;
  accent-color: var(--chrome-accent);
}
.row__value {
  min-width: 64px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.hint {
  margin: 4px 0 0;
  font-size: 11px;
  opacity: 0.55;
  line-height: 1.5;
}
</style>
