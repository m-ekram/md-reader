/**
 * Counting words, one way for the status bar, the selection and the word count
 * panel alike.
 *
 * A word is a run of characters between spaces that holds a letter or a digit,
 * so a heading's `#`, a list's `-` or a table's `|` is not one. Chinese and
 * Japanese are written without spaces, so each of their characters counts as a
 * word; otherwise a Japanese document reads as a handful. Unicode property
 * escapes rather than ranges: the ranges hold an ideographic space, which is
 * invisible in source and easy to corrupt.
 */
const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}`

/**
 * One CJK character, or a run that starts at a letter or digit and stops at a
 * space or CJK. Compiled on first use: the script classes are costly to build,
 * and nothing is counted until after the first document shows.
 */
let word: RegExp | null = null

export function countWords(text: string): number {
  word ??= new RegExp(String.raw`[${CJK}]|[\p{L}\p{N}][^\s${CJK}]*`, 'gu')
  word.lastIndex = 0
  let n = 0
  while (word.exec(text)) n++
  return n
}
