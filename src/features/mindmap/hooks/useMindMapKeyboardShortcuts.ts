import React from 'react'
import type { NodeMenuAction } from '../../document/NodeContextMenu'

interface UseMindMapKeyboardShortcutsParams {
  selectedNodeId: string | null
  runAction: (nodeId: string, action: NodeMenuAction) => void
  closeContextMenu: () => void
  clearEditing: () => void
  selectNode: (nodeId: string | null) => void
}

const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]'))
}

export function useMindMapKeyboardShortcuts({
  selectedNodeId,
  runAction,
  closeContextMenu,
  clearEditing,
  selectNode,
}: UseMindMapKeyboardShortcutsParams) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeContextMenu])

  return React.useCallback((event: React.KeyboardEvent) => {
    if (isTextInputTarget(event.target) || !selectedNodeId) return

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      runAction(selectedNodeId, 'toggleChecked')
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowUp') {
      event.preventDefault()
      runAction(selectedNodeId, 'moveUp')
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowDown') {
      event.preventDefault()
      runAction(selectedNodeId, 'moveDown')
      return
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        runAction(selectedNodeId, event.shiftKey ? 'insertChild' : 'insertSibling')
        break
      case 'Tab':
        event.preventDefault()
        runAction(selectedNodeId, event.shiftKey ? 'outdent' : 'indent')
        break
      case 'Escape':
        event.preventDefault()
        closeContextMenu()
        clearEditing()
        selectNode(null)
        break
    }
  }, [clearEditing, closeContextMenu, runAction, selectNode, selectedNodeId])
}
