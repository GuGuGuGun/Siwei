import React from 'react'
import type { MindMapMenuAction } from '../MindMapContextMenu'

interface MindMapContextMenuState {
  nodeId: string
  x: number
  y: number
}

interface MindMapOverlayHandlerOptions {
  contextMenu: MindMapContextMenuState | null
  experimentalLayoutEnabled: boolean
  forcePreviewActive: boolean
  runAction: (nodeId: string, action: MindMapMenuAction) => void
  handleFocusBranch: (nodeId: string) => void
  handleRelayoutBranch: (nodeId: string) => void
  handleUnlockNode: (nodeId: string) => void
  closeContextMenu: () => void
  setDiagnosticsOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  navigateSearch: (direction: 1 | -1) => void
}

export function useMindMapOverlayHandlers({
  contextMenu,
  experimentalLayoutEnabled,
  forcePreviewActive,
  runAction,
  handleFocusBranch,
  handleRelayoutBranch,
  handleUnlockNode,
  closeContextMenu,
  setDiagnosticsOpen,
  setSearchOpen,
  navigateSearch,
}: MindMapOverlayHandlerOptions) {
  const handleContextMenuAction = React.useCallback((action: MindMapMenuAction) => {
    if (!contextMenu) return
    runAction(contextMenu.nodeId, action)
  }, [contextMenu, runAction])

  const handleFocusContextBranch = React.useCallback(() => {
    if (!contextMenu) return
    handleFocusBranch(contextMenu.nodeId)
    closeContextMenu()
  }, [closeContextMenu, contextMenu, handleFocusBranch])

  const handleRelayoutContextBranch = React.useMemo(() => {
    if (!experimentalLayoutEnabled || forcePreviewActive || !contextMenu) return undefined
    return () => {
      handleRelayoutBranch(contextMenu.nodeId)
      closeContextMenu()
    }
  }, [closeContextMenu, contextMenu, experimentalLayoutEnabled, forcePreviewActive, handleRelayoutBranch])

  const handleUnlockContextNode = React.useMemo(() => {
    if (!experimentalLayoutEnabled || forcePreviewActive || !contextMenu) return undefined
    return () => {
      handleUnlockNode(contextMenu.nodeId)
      closeContextMenu()
    }
  }, [closeContextMenu, contextMenu, experimentalLayoutEnabled, forcePreviewActive, handleUnlockNode])

  return {
    handleContextMenuAction,
    handleFocusContextBranch,
    handleRelayoutContextBranch,
    handleUnlockContextNode,
    handleToggleDiagnostics: () => setDiagnosticsOpen((open) => !open),
    handleToggleSearch: () => setSearchOpen((open) => !open),
    handlePreviousSearchResult: () => navigateSearch(-1),
    handleNextSearchResult: () => navigateSearch(1),
  }
}
