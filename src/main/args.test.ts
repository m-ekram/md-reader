import { describe, it, expect } from 'vitest'
import { markdownArgs } from './args'

const exists = (paths: string[]) => (p: string) => paths.includes(p)

describe('markdownArgs', () => {
  it('takes the markdown files from a launch, skipping the executable and flags', () => {
    const argv = ['ekram-md.exe', '--allow-file-access', 'C:\\notes\\a.md', 'C:\\notes\\b.markdown']
    expect(markdownArgs(argv, exists(['C:\\notes\\a.md', 'C:\\notes\\b.markdown']))).toEqual([
      'C:\\notes\\a.md',
      'C:\\notes\\b.markdown',
    ])
  })

  it('accepts every extension the app opens, in any case', () => {
    const files = ['x.MD', 'x.mdown', 'x.mkd', 'x.txt']
    expect(markdownArgs(['exe', ...files], exists(files))).toEqual(files)
  })

  it('skips files that are gone and files it does not open', () => {
    expect(markdownArgs(['exe', 'gone.md', 'picture.png'], exists(['picture.png']))).toEqual([])
  })
})
