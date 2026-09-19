/// <reference types="vite/client" />
import type { Api } from '../../preload'

declare global {
  interface Window {
    api: Api
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

export {}
