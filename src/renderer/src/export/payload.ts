/**
 * Assembling what an export needs, on the renderer side.
 *
 * The renderer owns this because it is the only side with the rendered
 * document: main has the markdown text, but not the KaTeX spans, the mermaid
 * SVG or the theme that is actually applied. Main does the parts that need the
 * filesystem — inlining images, writing the file, printing to PDF.
 */
import DOMPurify from 'dompurify'
import contractCss from '../themes/contract.css?inline'
import editorCss from '../editor/editor.css?inline'
import githubCss from '../themes/github.css?inline'
import nightCss from '../themes/night.css?inline'
import claudeLightCss from '../themes/claude-light.css?inline'
import newsprintCss from '../themes/newsprint.css?inline'
import pixyllCss from '../themes/pixyll.css?inline'
import whiteyCss from '../themes/whitey.css?inline'
import nordCss from '../themes/nord.css?inline'
import oneDarkCss from '../themes/one-dark.css?inline'
import sepiaCss from '../themes/sepia.css?inline'
import gruvboxDarkCss from '../themes/gruvbox-dark.css?inline'
import katexCss from 'katex/dist/katex.min.css?inline'
import { cleanForExport } from './clean'
import { activeDoc } from '../stores/documents'
import { useThemeStore } from '../stores/theme'
import type { ExportPayload } from '../../../main/export/html'

const BUILTIN_CSS: Record<string, string> = {
  'claude-light': claudeLightCss,
  github: githubCss,
  newsprint: newsprintCss,
  night: nightCss,
  pixyll: pixyllCss,
  whitey: whiteyCss,
  nord: nordCss,
  'one-dark': oneDarkCss,
  sepia: sepiaCss,
  'gruvbox-dark': gruvboxDarkCss,
}

/**
 * Sanitized explicitly rather than trusting what is on screen.
 *
 * Crepe depends on DOMPurify internally, but that is its business: an export
 * is a file handed to someone else, and raw HTML in a markdown document has
 * reached this point unsanitized by us. SVG is allowed because mermaid
 * diagrams and KaTeX are SVG; scripts and event handlers are not.
 */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'formaction'],
    // Keeps `data-alert`, which is what draws the alert styling.
    ALLOW_DATA_ATTR: true,
    /**
     * DOMPurify's default allow-list has no `file:`, so it strips the `src`
     * off every local image — which is exactly what the editor resolves
     * relative links to for display. Measured, not guessed: exports came out
     * with `<img>` tags carrying no source at all.
     *
     * `data:` is deliberately still excluded. Images become data URIs in main,
     * after this runs, so allowing it here would only admit `data:text/html`
     * in a link.
     */
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|ftps?|mailto|tel|callto|sms|cid|xmpp|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  })
}

/**
 * The stylesheets an exported file needs, in cascade order.
 *
 * The same files the application loads, which is what makes an export match
 * the screen. A user theme is read from disk instead, since it has no bundled
 * counterpart.
 */
async function stylesheetFor(themeId: string, builtin: boolean): Promise<string> {
  const themeCss = builtin
    ? (BUILTIN_CSS[themeId] ?? BUILTIN_CSS.github)
    : await window.api.themes.read(themeId)
  return [contractCss, themeCss, katexCss, editorCss].join('\n\n')
}

/** Null when there is nothing open to export. */
export async function collectExport(): Promise<ExportPayload | null> {
  const doc = activeDoc.value
  if (!doc) return null

  const root = document.querySelector('.milkdown .ProseMirror')
  if (!(root instanceof HTMLElement)) return null

  const theme = useThemeStore()
  const info = theme.available.find((t) => t.id === theme.current)

  return {
    title: doc.name.replace(/\.[^.]+$/, ''),
    bodyHtml: sanitize(cleanForExport(root)),
    css: await stylesheetFor(theme.current, info?.builtin ?? true),
    themeId: theme.current,
    documentPath: doc.path,
  }
}
