import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  resolve: {
    // Crepe bundles its own Vue for widgets; keep exactly one copy.
    dedupe: ['vue'],
  },
  test: {
    projects: [
      {
        resolve: { dedupe: ['vue'] },
        // So component behaviour can be tested directly, rather than only
        // through the end-to-end suite where it depends on pointer position
        // and test ordering.
        plugins: [vue()],
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['spike/**/*.test.ts', 'src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['e2e/**/*.test.ts'],
          // The suite runs against out/, so it must build first.
          globalSetup: ['e2e/global-setup.ts'],
          // Electron launch plus a full menu walk needs room.
          testTimeout: 60_000,
          hookTimeout: 90_000,
          fileParallelism: false,
          // A poll waits for a condition; one second was too little on a busy
          // Windows runner, where a single read of the page can take longer
          // (two different tests, 1 run in 3 each, the same week). A value
          // that never arrives still fails; checks that something did not
          // happen use nextFrames, not polls.
          expect: { poll: { timeout: 5000 } },
        },
      },
    ],
  },
})
