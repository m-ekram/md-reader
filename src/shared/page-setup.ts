/**
 * How an exported PDF is laid out: chosen in the page setup shown before each
 * Export PDF, remembered in the settings (`pdf`), and checked in main before
 * it reaches Chromium's printing.
 */

export const PAGE_SIZES = ['A4', 'Letter', 'Legal', 'A3', 'A5'] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const MARGINS = { narrow: 0.4, normal: 0.6, wide: 1 } as const
export type Margin = keyof typeof MARGINS

export interface PageSetup {
  pageSize: PageSize
  landscape: boolean
  margin: Margin
  /** "3 / 12" at the foot of each page. */
  pageNumbers: boolean
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  pageSize: 'A4',
  landscape: false,
  margin: 'normal',
  pageNumbers: false,
}

/** A page setup from anywhere, with anything unknown put back to the default. */
export function validPageSetup(raw: unknown): PageSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    pageSize: PAGE_SIZES.includes(r.pageSize as PageSize)
      ? (r.pageSize as PageSize)
      : DEFAULT_PAGE_SETUP.pageSize,
    landscape: r.landscape === true,
    margin: Object.hasOwn(MARGINS, r.margin as string)
      ? (r.margin as Margin)
      : DEFAULT_PAGE_SETUP.margin,
    pageNumbers: r.pageNumbers === true,
  }
}
