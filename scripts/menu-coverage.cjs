/**
 * Menu coverage: how many of the menu's items have a command behind them.
 *
 * A script rather than a number in the README kept up by hand, because the
 * hand-kept one was wrong — it said 65 while 106 items were implemented.
 *
 *   node scripts/menu-coverage.cjs [--list]
 */
const fs = require('node:fs')
const path = require('node:path')

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'renderer', 'src', 'commands')

const read = (file) => fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8')

/** Every id the menu declares, in menu order. */
function menuIds() {
  return [...read('menus.ts').matchAll(/item\('([^']+)'/g)].map((m) => m[1])
}

/**
 * Ids that some command file registers.
 *
 * Several families are generated — headings from a list of levels, alerts from
 * a list of kinds — so their `id` is a template literal and no plain string to
 * match. Those become patterns: `para.h${level}` matches para.h1 through h6.
 * Matching the shape rather than keeping a list of exceptions is what stops
 * this drifting the way the hand-written count did.
 */
/**
 * Ids in `unavailable-commands.ts`.
 *
 * Those are registered and permanently disabled — menu items we decided not to
 * implement because the editor could draw them but not save them. Counting
 * them as implemented would turn a deliberate decision into a better-looking
 * number, so they are reported on their own line.
 */
function declined() {
  const src = read('unavailable-commands.ts')
  return new Set([...src.matchAll(/id: '([\w.]+)'/g)].map((m) => m[1]))
}

function registered() {
  const literal = new Set()
  const patterns = []

  for (const file of fs.readdirSync(COMMANDS_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
    if (file === 'menus.ts' || file === 'registry.ts') continue
    if (file === 'unavailable-commands.ts') continue
    const src = read(file)

    for (const m of src.matchAll(/id: '([\w.]+)'/g)) literal.add(m[1])
    // Pairs of [id, settingsKey], how the smart-punctuation commands are built.
    for (const m of src.matchAll(/\['([\w.]+)', '\w+'\]/g)) literal.add(m[1])

    for (const m of src.matchAll(/id: `([^`]+)`/g)) {
      patterns.push(new RegExp(`^${m[1].replace(/\$\{[^}]+\}/g, '.+')}$`))
    }
  }

  return { literal, patterns }
}

const { literal, patterns } = registered()
const unavailable = declined()
const isImplemented = (id) => literal.has(id) || patterns.some((p) => p.test(id))

const ids = menuIds()
const missing = ids.filter((id) => !isImplemented(id) && !unavailable.has(id))
const declinedHere = ids.filter((id) => unavailable.has(id))
const done = ids.length - missing.length - declinedHere.length

console.log(`Menu coverage: ${done} of ${ids.length} items`)
console.log(
  `  ${declinedHere.length} deliberately unavailable, ${missing.length} not yet implemented`
)

if (process.argv.includes('--list')) {
  if (declinedHere.length > 0) {
    console.log(`\nDeliberately unavailable (${declinedHere.length}):`)
    for (const id of declinedHere) console.log(`  ${id}`)
  }
  if (missing.length > 0) {
    console.log(`\nNot yet implemented (${missing.length}):`)
    for (const id of missing) console.log(`  ${id}`)
  }
}
