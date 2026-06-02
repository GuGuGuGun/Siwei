import React from 'react'

interface NodeDragDropOptions {
  nodeId: string
  onMoveToSibling: (sourceNodeId: string, targetNodeId: string) => void
}

export function useNodeDragDrop({ nodeId, onMoveToSibling }: NodeDragDropOptions) {
  const handleDragStart = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-siwei-node-id', nodeId)
  }, [nodeId])

  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const draggedNodeId = event.dataTransfer.types.includes('application/x-siwei-node-id')
    if (!draggedNodeId) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const sourceNodeId = event.dataTransfer.getData('application/x-siwei-node-id')
    if (!sourceNodeId || sourceNodeId === nodeId) return

    onMoveToSibling(sourceNodeId, nodeId)
  }, [nodeId, onMoveToSibling])

  return {
    handleDragStart,
    handleDragOver,
    handleDrop,
  }
}
