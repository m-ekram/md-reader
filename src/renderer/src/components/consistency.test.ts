import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Small things the whole interface should do one way.
 *
 * Close buttons were drawn with two different characters, × and ✕, at
 * whatever size each font gave them, beside the title bar's drawn icon.
 */
function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? vueFiles(join(dir, e.name))
      : e.name.endsWith('.vue')
        ? [join(dir, e.name)]
        : []
  )
}

const templates = vueFiles(__dirname).map((path) => {
  const source = readFileSync(path, 'utf8')
  const template = source.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? ''
  return { path, template }
})

describe('the interface', () => {
  it('draws every close button with the same icon, not a text character', () => {
    const offenders = templates
      .filter(({ template }) => /[×✕✖]/.test(template))
      .map(({ path }) => path.slice(__dirname.length + 1))
    expect(offenders).toEqual([])
  })
})
