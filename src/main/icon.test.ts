import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The icon files the build ships, generated from resources/logo.png by
 * scripts/make-icons.py.
 *
 * A missing or truncated icon.ico does not fail a build: electron-builder
 * quietly uses Electron's own icon instead, so the exe, the taskbar and every
 * associated .md file would lose the logo with nothing reporting it.
 */
const ROOT = join(__dirname, '..', '..')

/** The width and height of each image in an .ico, from its directory. */
function icoSizes(file: string): number[] {
  const buf = readFileSync(file)
  expect(buf.readUInt16LE(0), 'reserved field').toBe(0)
  expect(buf.readUInt16LE(2), 'type 1 is an icon').toBe(1)
  const count = buf.readUInt16LE(4)
  const sizes: number[] = []
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    // A stored 0 means 256: the field is one byte.
    const width = buf[entry] || 256
    const height = buf[entry + 1] || 256
    expect(width, `image ${i} is square`).toBe(height)
    // The image itself, not only its entry in the directory: a file cut short
    // after the directory still has a perfect header.
    const length = buf.readUInt32LE(entry + 8)
    const offset = buf.readUInt32LE(entry + 12)
    expect(offset + length, `the ${width} px image is all there`).toBeLessThanOrEqual(buf.length)
    const isPng = buf.subarray(offset + 1, offset + 4).toString('ascii') === 'PNG'
    const isBitmap = buf.readUInt32LE(offset) === 40
    expect(isPng || isBitmap, `the ${width} px image is a PNG or a bitmap`).toBe(true)
    sizes.push(width)
  }
  return sizes
}

/** Width, height and colour type from a PNG's header chunk. */
function pngHeader(file: string): { width: number; height: number; colourType: number } {
  const buf = readFileSync(file)
  expect(buf.subarray(1, 4).toString('ascii'), 'a PNG').toBe('PNG')
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colourType: buf[25],
  }
}

// Colour type 6 is RGBA: without alpha, the icon would sit on a square of
// the logo's paper colour.
const RGBA = 6

describe('app icon', () => {
  it('holds every size Windows asks for, from 16 to 256 px', () => {
    const sizes = icoSizes(join(ROOT, 'resources', 'icon.ico'))
    for (const size of [16, 24, 32, 48, 64, 128, 256]) expect(sizes).toContain(size)
  })

  it('has a transparent background at 512 px, for the window and About', () => {
    expect(pngHeader(join(ROOT, 'resources', 'icon.png'))).toEqual({
      width: 512,
      height: 512,
      colourType: RGBA,
    })
  })

  it('has a title bar mark with a transparent background', () => {
    const mark = pngHeader(join(ROOT, 'src', 'renderer', 'src', 'assets', 'logo-mark.png'))
    expect(mark).toEqual({ width: 64, height: 64, colourType: RGBA })
  })
})
