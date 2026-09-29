import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mayOpenExport, rememberExport } from './exported'

const dir = join(tmpdir(), 'exported-test')

describe('opening an export', () => {
  it('is allowed for a file this session exported', () => {
    const out = join(dir, 'notes.html')
    rememberExport(out)
    expect(mayOpenExport(out)).toBe(true)
  })

  it('is refused for any other file', () => {
    expect(mayOpenExport(join(dir, 'never-exported.html'))).toBe(false)
    expect(mayOpenExport('C:\\Windows\\System32\\calc.exe')).toBe(false)
  })

  it('is refused for an exported file that is not a page or a PDF', () => {
    // The save dialog lets a name be typed with any extension.
    const out = join(dir, 'run-me.bat')
    rememberExport(out)
    expect(mayOpenExport(out)).toBe(false)
  })

  it('matches the path however it is written', () => {
    const out = join(dir, 'Report.pdf')
    rememberExport(out)
    expect(mayOpenExport(join(dir, 'sub', '..', 'Report.pdf'))).toBe(true)
  })
})
