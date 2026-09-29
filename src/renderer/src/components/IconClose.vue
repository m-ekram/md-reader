<script setup lang="ts">
/**
 * The close icon: the title bar's cross, drawn, for every close button.
 * They used × and ✕, at whatever size and weight each font gave them.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 10 })
</script>

<template>
  <svg
    class="icon-close"
    :width="size"
    :height="size"
    viewBox="0 0 10 10"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.icon-close {
  display: block;
  flex: none;
}
</style>
