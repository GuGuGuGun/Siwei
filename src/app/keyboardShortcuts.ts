export type GlobalShortcutId =
  | 'save'
  | 'undoRedo'
  | 'search'
  | 'command'
  | 'focusMode'
  | 'newDoc'
  | 'outlineView'
  | 'mindmapView'
  | 'splitView'

export interface GlobalShortcutDefinition {
  id: GlobalShortcutId
  matches: (event: KeyboardEvent) => boolean
}

const isMod = (event: KeyboardEvent) => event.ctrlKey || event.metaKey

export const GLOBAL_SHORTCUTS: GlobalShortcutDefinition[] = [
  {
    id: 'save',
    matches: (event) => isMod(event) && event.key.toLowerCase() === 's',
  },
  {
    id: 'undoRedo',
    matches: (event) => isMod(event) && event.key.toLowerCase() === 'z',
  },
  {
    id: 'search',
    matches: (event) => isMod(event) && event.key.toLowerCase() === 'f',
  },
  {
    id: 'command',
    matches: (event) => isMod(event) && event.key.toLowerCase() === 'k',
  },
  {
    id: 'focusMode',
    matches: (event) => event.key === 'F11' || (isMod(event) && event.key === '\\'),
  },
  {
    id: 'newDoc',
    matches: (event) => isMod(event) && event.key.toLowerCase() === 'n',
  },
  {
    id: 'outlineView',
    matches: (event) => event.altKey && event.key === '1',
  },
  {
    id: 'mindmapView',
    matches: (event) => event.altKey && event.key === '2',
  },
  {
    id: 'splitView',
    matches: (event) => event.altKey && event.key === '3',
  },
]

export function findGlobalShortcut(event: KeyboardEvent): GlobalShortcutId | null {
  return GLOBAL_SHORTCUTS.find((shortcut) => shortcut.matches(event))?.id ?? null
}
