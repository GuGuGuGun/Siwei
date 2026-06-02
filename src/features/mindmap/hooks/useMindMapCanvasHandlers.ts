import React from 'react'
import type { Node, ReactFlowInstance } from 'reactflow'
import { isAgentInsertionNodeId } from '../agentInsertionPreviewBuilder'

interface MindMapCanvasHandlerOptions {
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance | null>
  selectNode: (nodeId: string | null) => void
  startEditing: (nodeId: string) => void
  openContextMenu: (nodeId: string, x: number, y: number) => void
  closeContextMenu: () => void
}

export function useMindMapCanvasHandlers({
  flowInstanceRef,
  selectNode,
  startEditing,
  openContextMenu,
  closeContextMenu,
}: MindMapCanvasHandlerOptions) {
  const handleNodeClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
    if (isAgentInsertionNodeId(node.id)) return
    selectNode(node.id)
  }, [selectNode])

  const handleNodeDoubleClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
    if (isAgentInsertionNodeId(node.id)) return
    startEditing(node.id)
  }, [startEditing])

  const handleNodeContextMenu = React.useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    if (isAgentInsertionNodeId(node.id)) return
    openContextMenu(node.id, event.clientX, event.clientY)
  }, [openContextMenu])

  const handlePaneClick = React.useCallback(() => {
    closeContextMenu()
    selectNode(null)
  }, [closeContextMenu, selectNode])

  const handleInit = React.useCallback((instance: ReactFlowInstance) => {
    flowInstanceRef.current = instance
  }, [flowInstanceRef])

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeContextMenu,
    handlePaneClick,
    handleInit,
  }
}
