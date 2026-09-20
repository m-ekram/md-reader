/**
 * Turning the editor's DOM into publishable HTML.
 *
 * Export reuses what is on screen rather than re-rendering the markdown, so an
 * export matches the document you were just looking at. The cost is that the
 * editing surface is heavily instrumented, and every rule here exists because
 * the real DOM was inspected and found to contain something that must not ship:
 *
 * - code blocks are CodeMirror instances, complete with a language picker, a
 *   copy button, cursor layers and generated class names whose styles live in
 *   an injected stylesheet that no export could reference
 * - list items are wrapped in a `<div>` *inside* the `<ul>`, which is invalid
 *   HTML, and carry their bullet as an inline SVG
 * - tables, paragraphs and blocks are followed by drag handles and add buttons
 * - a widget `<div contenteditable="false">` sits at the top of the document
 *
 * The cleaning is deliberately allow-list shaped: unknown editor furniture is
 * dropped rather than passed through, because anything that survives ends up in
 * a file someone else opens.
 */

/** Editor furniture: present for editing, meaningless in an exported file. */
const FURNITURE = [
  '.ProseMirror-widget',
  '.milkdown-block-handle',
  '.milkdown-slash-menu',
  '.milkdown-toolbar',
  '.milkdown-link-preview',
  '.milkdown-link-edit',
  '.milkdown-image-edit',
  '.milkdown-tooltip',
  '.handle',
  '.line-handle',
  '.operation-item',
  '.button-group',
  '.tools',
  '.tools-button-group',
  '.language-picker',
  '.cm-layer',
  '.cm-cursorLayer',
  '.cm-selectionLayer',
  '.cm-panels',
  '.cm-gutters',
  '.label-wrapper',
  '[data-role="x-line-drag-handle"]',
  '[data-role="x-handle"]',
  '.ProseMirror-gapcursor',
  '.placeholder',
]

/** Attributes that only mean something to the editor. */
const DROP_ATTRS = [
  'contenteditable',
  'spellcheck',
  'autocorrect',
  'autocapitalize',
  'writingsuggestions',
  'translate',
  'draggable',
  'data-v-app',
  'data-show',
  'data-display-type',
  'data-role',
  'data-content-dom',
  'aria-autocomplete',
  'aria-multiline',
  'role',
  'tabindex',
]

/** Class prefixes belonging to the editor rather than to the document. */
const DROP_CLASS = /^(cm-|ProseMirror|milkdown-|crepe-|is-selected|is-focused|ws-)/

/**
 * Replaces each CodeMirror block with a plain `<pre><code>`.
 *
 * The highlighting is not carried over: CodeMirror colours text with generated
 * class names (`ͼp` and friends) whose rules live in a stylesheet it injects at
 * runtime, so there is no file an export could reference. Correct, readable,
 * unhighlighted code is the right trade against colours that would not load.
 */
function normalizeCodeBlocks(root: HTMLElement): void {
  for (const block of Array.from(root.querySelectorAll('.milkdown-code-block'))) {
    const content = block.querySelector('.cm-content')
    // Each `.cm-line` is one line; textContent alone would run them together.
    const lines = Array.from(content?.querySelectorAll('.cm-line') ?? []).map(
      (line) => line.textContent ?? ''
    )
    const text = lines.length > 0 ? lines.join('\n') : (content?.textContent ?? '')
    const language = content?.getAttribute('data-language') ?? ''

    const pre = root.ownerDocument.createElement('pre')
    const code = root.ownerDocument.createElement('code')
    if (language) code.className = `language-${language}`
    code.textContent = text
    pre.appendChild(code)
    block.replaceWith(pre)
  }
}

/**
 * Lifts list items out of the wrapper div the editor puts them in.
 *
 * `<ul><div class="milkdown-list-item-block"><li>…` is not valid HTML and some
 * renderers drop the items entirely, so the `<li>` is reparented to the list
 * and the wrapper removed.
 */
function normalizeListItems(root: HTMLElement): void {
  for (const wrapper of Array.from(root.querySelectorAll('.milkdown-list-item-block'))) {
    const item = wrapper.querySelector('li')
    if (item) wrapper.replaceWith(item)
    else wrapper.remove()
  }

}

/**
 * Unwraps the containers node views put around their content.
 *
 * `div.children` holds a list item's body and any nested list;
 * `[data-content-dom]` is ProseMirror's own marker for the element a node view
 * renders into. Both are valid HTML, so removing them is tidiness rather than
 * correctness — but they carry editor-internal names into a file someone else
 * opens, and everything inside simply moves up a level.
 */
function unwrapNodeViewContainers(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('div.children, div[data-content-dom]'))) {
    el.replaceWith(...Array.from(el.childNodes))
  }
}

/**
 * Mermaid renders below its own source fence. The diagram is the content; the
 * fence is the way you edit it, so only the diagram is exported.
 */
function normalizeMermaid(root: HTMLElement): void {
  for (const figure of Array.from(root.querySelectorAll('.mermaid-figure'))) {
    if (figure.classList.contains('is-error') || !figure.querySelector('svg')) {
      // Nothing rendered: drop it rather than export an error message.
      figure.remove()
      continue
    }
    const previous = figure.previousElementSibling
    if (previous?.tagName === 'PRE' || previous?.classList.contains('milkdown-code-block')) {
      previous.remove()
    }
  }
}

/** Empty scaffolding tables the editor leaves behind around real ones. */
function removeEmptyTables(root: HTMLElement): void {
  for (const table of Array.from(root.querySelectorAll('table'))) {
    if (table.querySelector('td, th') === null) table.remove()
  }
}

function stripAttributes(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of DROP_ATTRS) el.removeAttribute(attr)

    // Style attributes are inline layout the editor computed — absolute
    // positions for cursors and handles — with one exception: table cell
    // alignment is document content that markdown expresses as a style.
    const style = el.getAttribute('style')
    if (style) {
      const alignment = style
        .split(';')
        .map((decl) => decl.trim())
        .filter((decl) => decl.startsWith('text-align'))
        .join('; ')
      if (alignment) el.setAttribute('style', alignment)
      else el.removeAttribute('style')
    }

    const kept = Array.from(el.classList).filter((c) => !DROP_CLASS.test(c))
    if (kept.length > 0) el.className = kept.join(' ')
    else el.removeAttribute('class')
  }
}

/**
 * Produces export-ready HTML from a clone of the editor's root element.
 *
 * Works on a clone: the live document must not be touched, and a bug here
 * should cost a bad export rather than the user's open file.
 */
export function cleanForExport(source: HTMLElement): string {
  const root = source.cloneNode(true) as HTMLElement

  for (const selector of FURNITURE) {
    for (const el of Array.from(root.querySelectorAll(selector))) el.remove()
  }

  normalizeCodeBlocks(root)
  normalizeListItems(root)
  unwrapNodeViewContainers(root)
  normalizeMermaid(root)
  removeEmptyTables(root)
  stripAttributes(root)

  return root.innerHTML
}
