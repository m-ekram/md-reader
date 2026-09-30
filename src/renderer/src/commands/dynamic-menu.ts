/**
 * The menus with their generated parts filled in: the themes, and Open Recent.
 *
 * The menu bar resolved these for itself, so the command palette, built from
 * the fixed specification, could not find a theme or a recent file by name.
 * Both now read the menus from here.
 */
import { MENUS, type Menu, type MenuNode } from './menus'
import { useThemeStore } from '../stores/theme'
import { useSettingsStore } from '../stores/settings'

/** One generated section as the items it stands for. */
function resolve(node: MenuNode): MenuNode[] {
  if (node.kind !== 'dynamic') return [node]

  if (node.source === 'themes') {
    return useThemeStore().available.map((t) => ({
      kind: 'item' as const,
      id: `theme.${t.id}`,
      label: t.name,
      radio: true,
    }))
  }

  const recent = useSettingsStore().value.recentFiles
  return [
    {
      kind: 'submenu',
      label: node.label,
      items:
        recent.length === 0
          ? [{ kind: 'item', id: 'file.noRecent', label: 'No Recent Files' }]
          : recent.map((p, i) => ({
              kind: 'item' as const,
              id: `file.recent.${i}`,
              label: p.split(/[\\/]/).pop() ?? p,
            })),
    },
  ]
}

/** Reactive: read inside a computed, it follows the theme list and recent files. */
export function resolvedMenus(): Menu[] {
  return MENUS.map((m) => ({ ...m, items: m.items.flatMap(resolve) }))
}
