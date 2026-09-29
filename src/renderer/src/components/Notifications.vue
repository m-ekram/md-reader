<script setup lang="ts">
/**
 * The stack of brief messages, above the status bar at the bottom right.
 *
 * Always in the page, even empty, so a screen reader has the live region
 * before the first message arrives: one added later is often not announced.
 */
import IconClose from './IconClose.vue'
import { dismiss, notes, pause, resume, runAction } from '../stores/notifications'
</script>

<template>
  <div class="notes" role="status" aria-live="polite">
    <div
      v-for="n in notes"
      :key="n.id"
      class="note"
      :class="{ 'note--error': n.kind === 'error' }"
      :role="n.kind === 'error' ? 'alert' : undefined"
      @mouseenter="pause(n.id)"
      @mouseleave="resume(n.id)"
      @focusin="pause(n.id)"
      @focusout="resume(n.id)"
    >
      <span class="note__text">{{ n.text }}</span>
      <button
        v-for="(a, i) in n.actions"
        :key="a.label"
        class="note__action"
        @click="runAction(n.id, i)"
      >
        {{ a.label }}
      </button>
      <button class="note__close" title="Dismiss" aria-label="Dismiss" @click="dismiss(n.id)">
        <IconClose />
      </button>
    </div>
  </div>
</template>

<style scoped>
.notes {
  position: absolute;
  right: 20px;
  bottom: 12px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: min(480px, calc(100% - 40px));
  pointer-events: none;
}
.note {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--menu-border);
  border-left: 3px solid var(--doc-accent);
  border-radius: 6px;
  background: var(--menu-bg);
  color: var(--menu-fg);
  font-size: 12.5px;
  box-shadow: var(--menu-shadow);
}
.note--error {
  border-left-color: var(--warning);
}
.note__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.note__action {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--menu-border);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: default;
}
.note__action:hover,
.note__close:hover {
  background: var(--menu-hover);
}
.note__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--menu-fg-muted);
}
</style>
