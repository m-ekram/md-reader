/**
 * Smart punctuation: curly quotes, en and em dashes, ellipses.
 *
 * Each kind is separately switchable, because they are not equally welcome.
 * Curly quotes are wrong inside anything code-like, and someone writing
 * technical notes may want dashes but not quotes.
 *
 * Applied as input rules, so they fire while typing and are undone by a single
 * press of undo — the standard escape hatch when a substitution was not wanted.
 */
import { $prose } from '@milkdown/kit/utils'
import { inputRules, InputRule } from '@milkdown/kit/prose/inputrules'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'

export interface PunctuationOptions {
  quotes: boolean
  dashes: boolean
  ellipses: boolean
}

export const punctuationOptions: PunctuationOptions = {
  quotes: true,
  dashes: true,
  ellipses: true,
}

export function setPunctuation(next: Partial<PunctuationOptions>): void {
  Object.assign(punctuationOptions, next)
}

/**
 * True when the caret is somewhere substitution would be wrong.
 *
 * Code is the obvious case: a curly quote inside a code span or fence changes
 * the code. Front matter is YAML, where a smart quote is a syntax error.
 */
function inLiteralContext(state: EditorState): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d >= 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'code_block' || name === 'frontmatter') return true
  }
  const marks = state.storedMarks ?? $from.marks()
  return marks.some((m) => m.type.name === 'inlineCode' || m.type.name === 'code_inline')
}

/**
 * Builds a rule that replaces only the captured group, when there is one.
 *
 * The quote rules have to look at the character *before* the quote to decide
 * whether it opens or closes, so their match spans more than they replace;
 * capturing the quote itself is what keeps the preceding character intact.
 * Written out here rather than reusing the library's string handler, which is
 * not reachable through its public types.
 */
function rule(match: RegExp, replacement: string, enabled: () => boolean): InputRule {
  return new InputRule(
    match,
    (state, m, start, end): Transaction | null => {
      if (!enabled() || inLiteralContext(state)) return null
      const captured = m[1]
      // No capture group: the whole match is what gets replaced.
      if (captured === undefined) return state.tr.insertText(replacement, start, end)
      const offset = m[0].lastIndexOf(captured)
      return state.tr.insertText(replacement, start + offset, end)
    }
  )
}

const quotes = (): boolean => punctuationOptions.quotes
const dashes = (): boolean => punctuationOptions.dashes
const ellipses = (): boolean => punctuationOptions.ellipses

/**
 * A quote opens when it follows whitespace, an opening bracket or a dash, and
 * closes otherwise. The simple rule, which is the one that reads correctly in
 * prose; the closing rules come second so the opening case wins.
 */
const OPENERS = '[\\s([{<—–]'

export const punctuationPlugin: MilkdownPlugin[] = [
  $prose(() =>
    inputRules({
      rules: [
        rule(new RegExp(`(?:^|${OPENERS})(")$`), '“', quotes),
        rule(/"$/, '”', quotes),
        rule(new RegExp(`(?:^|${OPENERS})(')$`), '‘', quotes),
        rule(/'$/, '’', quotes),

        // Two hyphens become an en dash and three an em dash. Typing is
        // progressive, so by the time the third hyphen arrives the first two
        // are already an en dash: that is the case the em rule has to match.
        // The literal three-hyphen form is kept for text that arrives at once.
        rule(/–-$/, '—', dashes),
        rule(/---$/, '—', dashes),
        rule(/(?:^|[^-])(--)$/, '–', dashes),

        rule(/\.\.\.$/, '…', ellipses),
      ],
    })
  ),
] as MilkdownPlugin[]
