/**
 * The formatting toolbar: Crepe's top bar, shown with View > Toolbar.
 *
 * It is always built and only shown or hidden (a class on the root element,
 * see stores/appearance.ts), so toggling it keeps every editor and its undo
 * history. One change to Crepe's own:
 *
 *  - Every button is labelled. Crepe draws them as bare icons.
 */

/**
 * The buttons' labels, in the order Crepe renders them.
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
  'Math',
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
