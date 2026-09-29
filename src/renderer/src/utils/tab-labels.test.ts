import { describe, it, expect } from 'vitest'
import { tabLabels } from './tab-labels'

/**
 * Tab names. Two files with the same name, two README.md files, made two
 * identical tabs.
 */
const doc = (name: string, path: string | null = null) => ({ name, path })

describe('tab labels', () => {
  it('are the file name when it is the only one of that name', () => {
    expect(tabLabels([doc('a.md', 'C:\\n\\a.md'), doc('b.md', 'C:\\n\\b.md')])).toEqual([
      'a.md',
      'b.md',
    ])
  })

  it('add the folder that tells two files of one name apart', () => {
    expect(
      tabLabels([
        doc('README.md', 'C:\\work\\app\\README.md'),
        doc('README.md', 'C:\\work\\lib\\README.md'),
        doc('notes.md', 'C:\\work\\notes.md'),
      ])
    ).toEqual(['README.md — app', 'README.md — lib', 'notes.md'])
  })

  it('go up as many folders as it takes', () => {
    expect(
      tabLabels([
        doc('index.md', 'C:\\a\\docs\\index.md'),
        doc('index.md', 'C:\\b\\docs\\index.md'),
      ])
    ).toEqual(['index.md — a\\docs', 'index.md — b\\docs'])
  })

  it('leave unsaved documents as they are', () => {
    expect(tabLabels([doc('Untitled'), doc('Untitled 2')])).toEqual(['Untitled', 'Untitled 2'])
  })

  it('treat names that differ only in case as the same, as Windows does', () => {
    expect(
      tabLabels([doc('Notes.md', 'C:\\x\\Notes.md'), doc('notes.md', 'C:\\y\\notes.md')])
    ).toEqual(['Notes.md — x', 'notes.md — y'])
  })
})
