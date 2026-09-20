import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // The search worker is a second entry point, not part of the main
        // bundle: worker_threads loads it from disk by path at runtime.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'search-worker': resolve(__dirname, 'src/main/search-worker.ts'),
        },
        output: { entryFileNames: '[name].js' },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [vue()],
    resolve: {
      // Crepe bundles its own Vue for widgets; keep exactly one copy.
      dedupe: ['vue'],
    },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
})
