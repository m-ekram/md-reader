/**
 * The formatting toolbar: Crepe's top bar, shown with View > Toolbar.
 *
 * It is always built and only shown or hidden (a class on the root element,
 * see stores/appearance.ts), so toggling it keeps every editor and its undo
 * history. Two changes to Crepe's own:
 *
 *  - No math button. It inserts a LaTeX code block, while the app's menus
 *    deliberately offer no block math; the toolbar should not offer what the
 *    menus refuse.
 *  - Every button is labelled. Crepe draws them as bare icons.
 */
import { commandsCtx } from '@milkdown/kit/core'
import { codeBlockSchema, setBlockTypeCommand } from '@milkdown/kit/preset/commonmark'
import type { TopBarFeatureConfig } from '@milkdown/crepe/feature/top-bar'

type Builder = Parameters<NonNullable<TopBarFeatureConfig['buildTopBar']>>[0]

/** Crepe's own code-block icon, so the one button kept looks unchanged. */
const CODE_BLOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm8 10h6v2h-6v-2zm-3.333-3L5.838 9.172l1.415-1.415L11.495 12l-4.242 4.243-1.415-1.415L8.667 12z"/></svg>`

/** The block group without its math button: code block only, as Crepe builds it. */
export function buildTopBar(builder: Builder): void {
  const block = builder.getGroup('block')
  block.clear()
  block.addItem('code-block', {
    icon: CODE_BLOCK_ICON,
    active: () => false,
    onRun: (ctx) => {
      ctx.get(commandsCtx).call(setBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx) })
    },
  })
}

/**
 * The buttons' labels, in the order Crepe renders them once math is gone.
 * The end-to-end suite clicks "Bold" and checks for bold text, so a change of
 * order upstream fails a test rather than mislabelling a button.
 */
export const TOP_BAR_LABELS = [
  'Bold',
  'Italic',
  'Strikethrough',
  'Inline code',
  'Bullet list',
  'Numbered list',
  'Task list',
  'Link',
  'Image',
  'Table',
  'Code block',
  'Quote',
  'Horizontal rule',
]

/**
 * Labels the toolbar's buttons whenever it renders them.
 *
 * Only the toolbar is watched, not the document: a watch on the whole editor
 * would run on every keystroke. Labels are applied only when the button count
 * matches, so an unexpected layout gets no labels rather than wrong ones.
 */
export function labelTopBar(root: HTMLElement): () => void {
  let observer: MutationObserver | null = null
  const apply = (bar: Element): void => {
    const heading = bar.querySelector<HTMLElement>('.top-bar-heading-button')
    if (heading && !heading.title) heading.title = 'Paragraph or heading'
    const items = bar.querySelectorAll<HTMLElement>('.top-bar-item')
    if (items.length !== TOP_BAR_LABELS.length) return
    items.forEach((el, i) => {
      if (el.title !== TOP_BAR_LABELS[i]) {
        el.title = TOP_BAR_LABELS[i]
        el.setAttribute('aria-label', TOP_BAR_LABELS[i])
      }
    })
  }
  const bar = root.querySelector('.milkdown-top-bar')
  if (bar) {
    apply(bar)
    observer = new MutationObserver(() => apply(bar))
    observer.observe(bar, { childList: true, subtree: true })
  }
  return () => observer?.disconnect()
}
