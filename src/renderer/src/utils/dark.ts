/**
 * Whether the theme in force has a dark page.
 *
 * Measured from the theme's own `--doc-bg` rather than kept as a list of dark
 * theme names. The list was one entry long — `'night'` — so every dark theme
 * added later drew light diagrams and a light source view on a dark page, and
 * a user theme could never have been on it at all. Reading the colour makes the
 * stylesheet the single source of truth.
 *
 * No imports, so modules on either side of the theme store can use it without
 * a cycle.
 */
export function isDarkTheme(): boolean {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--doc-bg').trim()
  const rgb = value ? toRgb(value) : null
  if (!rgb) return false
  const [r, g, b] = rgb
  // Perceived brightness (Rec. 709 weights), on the 0-255 scale.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}

/** A CSS colour as [r, g, b], or null when it cannot be read. */
export function toRgb(value: string): [number, number, number] | null {
  // Hex, which is what every built-in theme uses, parsed directly.
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }

  // Anything else — rgb(), a named colour — resolved by the browser through a
  // throwaway element, which reports it as rgb().
  const probe = document.createElement('span')
  probe.style.color = value
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  const parts = resolved.match(/\d+(\.\d+)?/g)
  return parts && parts.length >= 3 ? [Number(parts[0]), Number(parts[1]), Number(parts[2])] : null
}
