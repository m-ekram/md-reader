import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['spike/**/*.test.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    // Crepe bundles its own Vue for widgets; keep exactly one copy.
    dedupe: ['vue'],
  },
})
