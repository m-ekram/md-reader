/**
 * The settings schema, shared by main and renderer so both agree on shape and
 * defaults. Phase 0 established that electron-store@11 is ESM-only and fights
 * electron-vite's CJS main bundle, so the store is hand-rolled instead; this is
 * the type contract it enforces.
 */
import { DEFAULT_PAGE_SETUP, type PageSetup } from './page-setup'

export interface Settings {
  /** Active theme id, matching a file in the themes folder. */
  theme: string
  /** Serialized window bounds, restored on launch. */
  window: { width: number; height: number; x?: number; y?: number; maximized: boolean }
  sidebar: { visible: boolean; width: number; panel: 'outline' | 'articles' | 'files' | 'search' }
  /** Last opened folder, reopened on launch. Null when none. */
  workspace: string | null
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
    /** The language spelling is checked in, such as 'en-GB'; null follows the system. */
    spellcheckLanguage: string | null
    /** Folder for pasted images, relative to the document. */
    assetsFolder: string
    /** Draws markers for spaces, tabs and line breaks. */
    showWhitespace: boolean
    /** Smart punctuation, each kind separately switchable. */
    smartQuotes: boolean
    smartDashes: boolean
    smartEllipses: boolean
    /** Document text size in px; null keeps the theme's. Zoom steps this. */
    fontSize: number | null
    /** Column width in px, or 'full' for the whole pane; null keeps the theme's. */
    contentWidth: number | 'full' | null
    /** The text's font, by family name; null keeps the theme's. */
    fontFamily: string | null
    /** The font for code, by family name; null keeps the theme's. */
    codeFontFamily: string | null
    /** Line height as a multiple of the text size; null keeps the theme's. */
    lineHeight: number | null
  }
  statusBar: boolean
  /** The formatting toolbar above the document. */
  toolbar: boolean
  recentFiles: string[]
  /**
   * The files open when the app last closed, reopened at the next launch when
   * `restore` is on. Saved files only: unsaved work comes back through
   * recovery, never through here.
   */
  session: { restore: boolean; files: string[]; active: string | null }
  /** Saves documents that have a file a moment after typing stops. */
  autoSave: boolean
  /** How long typing must pause before an auto-save, 300 ms to 10 s. */
  autoSaveDelayMs: number
  /** Line endings a new document is written with. Opened files keep their own. */
  newFileEol: 'crlf' | 'lf'
  /**
   * Follows Windows' light or dark mode with a theme for each. While on,
   * `theme` is kept as the choice to return to when it is switched off.
   */
  followSystem: { enabled: boolean; light: string; dark: string }
  /** The page setup last chosen for Export PDF. Checked in main before use. */
  pdf: PageSetup
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'github',
  window: { width: 1200, height: 820, maximized: false },
  // Hidden until a folder is opened: with none, it only said "No folder open".
  sidebar: { visible: false, width: 260, panel: 'files' },
  workspace: null,
  editor: {
    sourceModeOfferLines: 5000,
    sourceModeForceLines: 10000,
    liveEditors: 5,
    typewriter: false,
    focusMode: false,
    spellcheck: true,
    spellcheckLanguage: null,
    assetsFolder: 'assets',
    showWhitespace: false,
    smartQuotes: true,
    smartDashes: true,
    smartEllipses: true,
    fontSize: null,
    contentWidth: null,
    fontFamily: null,
    codeFontFamily: null,
    lineHeight: null,
  },
  statusBar: true,
  toolbar: false,
  recentFiles: [],
  session: { restore: true, files: [], active: null },
  autoSave: false,
  autoSaveDelayMs: 1000,
  newFileEol: 'crlf',
  followSystem: { enabled: false, light: 'github', dark: 'night' },
  pdf: { ...DEFAULT_PAGE_SETUP },
}

/**
 * A change to the settings: a group (`editor`, `sidebar`, …) may be given in
 * part, and only the fields named change.
 */
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends unknown[]
    ? Settings[K]
    : Settings[K] extends object
      ? Partial<Settings[K]>
      : Settings[K]
}

/**
 * Settings as main last had them, numbered.
 *
 * Main numbers every change. A window hears of a change twice, once as the
 * reply to its own patch and once as the broadcast to every window, and the two
 * travel separately, so an older one can arrive after a newer one. The number
 * says which is newer.
 */
export type SettingsState = Settings & { revision: number }

/**
 * Applies a patch one group deep.
 *
 * Callers used to send a whole group built from their own copy of it; a copy a
 * moment out of date then put back every field another change had just set.
 */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const next = { ...current } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const was = next[key]
    next[key] =
      isGroup(was) && isGroup(value) ? { ...was, ...(value as object) } : (value as unknown)
  }
  return next as unknown as Settings
}

function isGroup(v: unknown): v is object {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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
    if (d === null) {
      // Empty by default, and a string when set: the open folder. `typeof null`
      // is 'object', so the checks below dropped every saved folder.
      if (typeof v === 'string') (out as unknown as Record<string, unknown>)[key] = v
    } else if (
      typeof d === 'object' &&
      !Array.isArray(d) &&
      typeof v === 'object' &&
      !Array.isArray(v)
    ) {
      Object.assign(d as object, v)
    } else if (typeof v === typeof d) {
      ;(out as unknown as Record<string, unknown>)[key] = v
    }
  }
  return out
}
