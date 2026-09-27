import { describe, it, expect, vi } from 'vitest'
import { buildContextMenu, type ContextActions, type ContextParams } from './context-menu'

const params = (p: Partial<ContextParams> = {}): ContextParams => ({
  x: 10,
  y: 20,
  isEditable: true,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  linkURL: '',
  mediaType: 'none',
  editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
  ...p,
})

const actions = (): ContextActions => ({
  replaceMisspelling: vi.fn(),
  addToDictionary: vi.fn(),
  openLink: vi.fn(),
  copyText: vi.fn(),
  copyImageAt: vi.fn(),
})

const labels = (items: ReturnType<typeof buildContextMenu>) =>
  items.map((i) => i.label ?? i.role ?? i.type)

describe('the right-click menu', () => {
  it('offers the spelling fixes first, and each one fixes the word', () => {
    const act = actions()
    const menu = buildContextMenu(
      params({ misspelledWord: 'teh', dictionarySuggestions: ['the', 'ten', 'tech'] }),
      act
    )
    expect(labels(menu).slice(0, 4)).toEqual(['the', 'ten', 'tech', 'Add “teh” to Dictionary'])

    menu[0].click!({} as never, undefined, {} as never)
    expect(act.replaceMisspelling).toHaveBeenCalledWith('the')
    menu[3].click!({} as never, undefined, {} as never)
    expect(act.addToDictionary).toHaveBeenCalledWith('teh')
  })

  it('caps the suggestions, and says when there are none', () => {
    const many = buildContextMenu(
      params({ misspelledWord: 'x', dictionarySuggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
      actions()
    )
    expect(labels(many).indexOf('Add “x” to Dictionary')).toBe(5)

    const none = buildContextMenu(params({ misspelledWord: 'qzx' }), actions())
    expect(none[0]).toMatchObject({ label: 'No suggestions', enabled: false })
  })

  it('offers cut, copy and paste in the document, as each is possible', () => {
    const menu = buildContextMenu(
      params({ editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } }),
      actions()
    )
    expect(menu.find((i) => i.role === 'cut')?.enabled).toBe(false)
    expect(menu.find((i) => i.role === 'paste')?.enabled).toBe(true)
  })

  it('opens and copies web links, and nothing else', () => {
    const act = actions()
    const menu = buildContextMenu(params({ linkURL: 'https://example.com/a' }), act)
    menu.find((i) => i.label === 'Open Link')!.click!({} as never, undefined, {} as never)
    expect(act.openLink).toHaveBeenCalledWith('https://example.com/a')

    const local = buildContextMenu(params({ linkURL: 'file:///C:/secret.txt' }), actions())
    expect(labels(local)).not.toContain('Open Link')
  })

  it('copies an image where it was clicked', () => {
    const act = actions()
    const menu = buildContextMenu(params({ mediaType: 'image', isEditable: false }), act)
    menu.find((i) => i.label === 'Copy Image')!.click!({} as never, undefined, {} as never)
    expect(act.copyImageAt).toHaveBeenCalledWith(10, 20)
  })

  it('never starts or ends with a separator', () => {
    const menu = buildContextMenu(
      params({ linkURL: 'https://x.test', mediaType: 'image' }),
      actions()
    )
    expect(menu[0].type).not.toBe('separator')
    expect(menu.at(-1)?.type).not.toBe('separator')
  })
})
