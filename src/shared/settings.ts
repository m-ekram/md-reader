/**
 * The settings schema, shared by main and renderer so both agree on shape and
 * defaults. Phase 0 established that electron-store@11 is ESM-only and fights
 * electron-vite's CJS main bundle, so the store is hand-rolled instead; this is
 * the type contract it enforces.
 */
export interface Settings {
  /** Active theme id, matching a file in the themes folder. */
  theme: string
  /** Serialized window bounds, restored on launch. */
  window: { width: number; height: number; x?: number; y?: number; maximized: boolean }
  sidebar: { visible: boolean; width: number; panel: 'outline' | 'articles' | 'files' | 'search' }
  editor: {
    /** Offer source mode above this many lines; measured in Phase 0. */
    sourceModeOfferLines: number
    /** Default to source mode above this many lines. */
    sourceModeForceLines: number
    /**
     * How many editors stay alive so undo survives tab switches. Each one costs
     * memory, so this is the dial to turn if RSS becomes a problem.
     */
    liveEditors: number
    typewriter: boolean
    focusMode: boolean
    spellcheck: boolean
    /** Folder for pasted images, relative to the document. */
    assetsFolder: string
  }
  statusBar: boolean
  recentFiles: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'github',
  window: { width: 1200, height: 820, maximized: false },
  sidebar: { visible: true, width: 260, panel: 'files' },
  editor: {
    sourceModeOfferLines: 5000,
    sourceModeForceLines: 10000,
    liveEditors: 5,
    typewriter: false,
    focusMode: false,
    spellcheck: true,
    assetsFolder: 'assets',
  },
  statusBar: true,
  recentFiles: [],
}

/**
 * Merges stored values over defaults one level deep, so a settings file written
 * by an older version gains new keys instead of tripping over missing ones.
 */
export function mergeSettings(stored: unknown): Settings {
  if (!stored || typeof stored !== 'object') return structuredClone(DEFAULT_SETTINGS)
  const s = stored as Record<string, unknown>
  const out = structuredClone(DEFAULT_SETTINGS)

  for (const key of Object.keys(out) as Array<keyof Settings>) {
    const v = s[key]
    if (v === undefined || v === null) continue
    const d = out[key]
    if (typeof d === 'object' && !Array.isArray(d) && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(d as object, v)
    } else if (typeof v === typeof d) {
      ;(out as unknown as Record<string, unknown>)[key] = v
    }
  }
  return out
}
