/**
 * What each tab is called: the file's name, and, where two open files share a
 * name, as much of their folders as it takes to tell them apart. Two
 * README.md files made two identical tabs.
 */

interface Named {
  name: string
  path: string | null
}

/** The folders a path is in, nearest first. */
function foldersOf(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean).slice(0, -1).reverse()
}

export function tabLabels(docs: readonly Named[]): string[] {
  const labels = docs.map((d) => d.name)
  const byName = new Map<string, number[]>()
  docs.forEach((d, i) => {
    if (!d.path) return
    const key = d.name.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), i])
  })

  for (const group of byName.values()) {
    if (group.length < 2) continue
    const folders = group.map((i) => foldersOf(docs[i].path!))
    // The fewest folders, counted up from the file, that make every suffix
    // in the group different.
    const deepest = Math.max(...folders.map((f) => f.length))
    let depth = 1
    for (; depth < deepest; depth++) {
      const suffixes = folders.map((f) => f.slice(0, depth).join('/').toLowerCase())
      if (new Set(suffixes).size === suffixes.length) break
    }
    group.forEach((i, j) => {
      const suffix = folders[j].slice(0, depth).reverse().join('\\')
      if (suffix) labels[i] = `${docs[i].name} — ${suffix}`
    })
  }
  return labels
}
