import React from 'react'

interface NodeDragDropOptions {
  nodeId: string
  parentId: string | null
  siblingIndex: number
  onMoveToSibling: (sourceNodeId: string, targetNodeId: string) => void
}

const OUTLINE_NODE_SELECTOR = '[data-node-id]'
const OUTLINE_ROW_PREVIEW_SHIFT_PX = 40

interface DragRowSnapshot {
  nodeId: string
  parentId: string | null
  siblingIndex: number
  top: number
  bottom: number
  centerY: number
}

interface OutlineDragVisualState {
  sourceNodeId: string | null
  sourceParentId: string | null
  sourceIndex: number | null
  targetNodeId: string | null
  targetParentId: string | null
  targetIndex: number | null
  offset: {
    x: number
    y: number
  }
}

const dragVisualListeners = new Set<() => void>()
let dragVisualState: OutlineDragVisualState = {
  sourceNodeId: null,
  sourceParentId: null,
  sourceIndex: null,
  targetNodeId: null,
  targetParentId: null,
  targetIndex: null,
  offset: { x: 0, y: 0 },
}

function subscribeDragVisualState(listener: () => void): () => void {
  dragVisualListeners.add(listener)
  return () => dragVisualListeners.delete(listener)
}

function getDragVisualState(): OutlineDragVisualState {
  return dragVisualState
}

function setDragVisualState(nextState: OutlineDragVisualState): void {
  if (
    dragVisualState.sourceNodeId === nextState.sourceNodeId &&
    dragVisualState.sourceParentId === nextState.sourceParentId &&
    dragVisualState.sourceIndex === nextState.sourceIndex &&
    dragVisualState.targetNodeId === nextState.targetNodeId &&
    dragVisualState.targetParentId === nextState.targetParentId &&
    dragVisualState.targetIndex === nextState.targetIndex &&
    dragVisualState.offset.x === nextState.offset.x &&
    dragVisualState.offset.y === nextState.offset.y
  ) {
    return
  }

  dragVisualState = nextState
  dragVisualListeners.forEach((listener) => listener())
}

function createEmptyDragVisualState(): OutlineDragVisualState {
  return {
    sourceNodeId: null,
    sourceParentId: null,
    sourceIndex: null,
    targetNodeId: null,
    targetParentId: null,
    targetIndex: null,
    offset: { x: 0, y: 0 },
  }
}

function collectDragRowSnapshots(): DragRowSnapshot[] {
  return Array.from(document.querySelectorAll<HTMLElement>(OUTLINE_NODE_SELECTOR))
    .map((element) => {
      const nodeId = element.dataset.nodeId
      const siblingIndex = Number(element.dataset.nodeSiblingIndex)
      if (!nodeId || !Number.isInteger(siblingIndex)) return null

      const rect = element.getBoundingClientRect()
      return {
        nodeId,
        parentId: element.dataset.nodeParentId || null,
        siblingIndex,
        top: rect.top,
        bottom: rect.bottom,
        centerY: rect.top + rect.height / 2,
      }
    })
    .filter((snapshot): snapshot is DragRowSnapshot => snapshot !== null)
}

function getDropTargetFromSnapshots(clientY: number, snapshots: DragRowSnapshot[]): DragRowSnapshot | null {
  if (snapshots.length === 0) return null

  const containingRow = snapshots.find((snapshot) => clientY >= snapshot.top && clientY <= snapshot.bottom)
  if (containingRow) return containingRow

  const minTop = Math.min(...snapshots.map((snapshot) => snapshot.top))
  const maxBottom = Math.max(...snapshots.map((snapshot) => snapshot.bottom))
  if (clientY < minTop || clientY > maxBottom) return null

  return snapshots.reduce((nearest, snapshot) => {
    const nearestDistance = Math.abs(clientY - nearest.centerY)
    const snapshotDistance = Math.abs(clientY - snapshot.centerY)
    return snapshotDistance < nearestDistance ? snapshot : nearest
  })
}

function getPreviewShiftY(
  visualState: OutlineDragVisualState,
  nodeId: string,
  parentId: string | null,
  siblingIndex: number,
): number {
  const {
    sourceNodeId,
    sourceParentId,
    sourceIndex,
    targetParentId,
    targetIndex,
  } = visualState
  if (
    !sourceNodeId ||
    sourceIndex === null ||
    targetIndex === null ||
    nodeId === sourceNodeId ||
    parentId !== sourceParentId ||
    targetParentId !== sourceParentId ||
    sourceIndex === targetIndex
  ) {
    return 0
  }

  if (sourceIndex < targetIndex && siblingIndex > sourceIndex && siblingIndex <= targetIndex) {
    return -OUTLINE_ROW_PREVIEW_SHIFT_PX
  }
  if (sourceIndex > targetIndex && siblingIndex >= targetIndex && siblingIndex < sourceIndex) {
    return OUTLINE_ROW_PREVIEW_SHIFT_PX
  }

  return 0
}

export function useNodeDragDrop({ nodeId, parentId, siblingIndex, onMoveToSibling }: NodeDragDropOptions) {
  const dragStateRef = React.useRef<{
    pointerId: number
    sourceNodeId: string
    sourceParentId: string | null
    sourceIndex: number
    startX: number
    startY: number
    rowSnapshots: DragRowSnapshot[]
  } | null>(null)

  const clearDragState = React.useCallback(() => {
    dragStateRef.current = null
    setDragVisualState(createEmptyDragVisualState())
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
  }, [])

  const handlePointerMove = React.useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    event.preventDefault()
    const target = getDropTargetFromSnapshots(event.clientY, dragState.rowSnapshots)
    const offset = {
      x: event.clientX - dragState.startX,
      y: event.clientY - dragState.startY,
    }
    setDragVisualState({
      sourceNodeId: dragState.sourceNodeId,
      sourceParentId: dragState.sourceParentId,
      sourceIndex: dragState.sourceIndex,
      targetNodeId: target && target.nodeId !== dragState.sourceNodeId ? target.nodeId : null,
      targetParentId: target?.parentId ?? null,
      targetIndex: target?.siblingIndex ?? null,
      offset,
    })
  }, [])

  const handlePointerUp = React.useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    event.preventDefault()
    const target = getDropTargetFromSnapshots(event.clientY, dragState.rowSnapshots)
    clearDragState()

    if (!target || target.nodeId === dragState.sourceNodeId) return
    onMoveToSibling(dragState.sourceNodeId, target.nodeId)
  }, [clearDragState, onMoveToSibling])

  React.useEffect(() => {
    return () => {
      clearDragState()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', clearDragState)
    }
  }, [clearDragState, handlePointerMove, handlePointerUp])

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    dragStateRef.current = {
      pointerId: event.pointerId,
      sourceNodeId: nodeId,
      sourceParentId: parentId,
      sourceIndex: siblingIndex,
      startX: event.clientX,
      startY: event.clientY,
      rowSnapshots: collectDragRowSnapshots(),
    }
    setDragVisualState({
      ...createEmptyDragVisualState(),
      sourceNodeId: nodeId,
      sourceParentId: parentId,
      sourceIndex: siblingIndex,
    })
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp, { passive: false })
    window.addEventListener('pointercancel', clearDragState, { once: true })
  }, [clearDragState, handlePointerMove, handlePointerUp, nodeId, parentId, siblingIndex])

  const visualState = React.useSyncExternalStore(
    subscribeDragVisualState,
    getDragVisualState,
    getDragVisualState,
  )

  return {
    handlePointerDown,
    isDragging: visualState.sourceNodeId === nodeId,
    isDropTarget: visualState.targetNodeId === nodeId,
    dragOffset: visualState.sourceNodeId === nodeId ? visualState.offset : { x: 0, y: 0 },
    previewShiftY: getPreviewShiftY(visualState, nodeId, parentId, siblingIndex),
  }
}
