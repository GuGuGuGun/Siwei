export type MindMapDropZone = 'before' | 'child' | 'after'

interface FlowLikeNode {
  id: string
  position: {
    x: number
    y: number
  }
  width?: number | null
  height?: number | null
}

interface ResolveDropMoveInput {
  sourceNodeId: string | null
  targetNodeId: string
  zone: MindMapDropZone
  targetParentId: string | null | undefined
  targetIndex: number | undefined
  targetChildCount: number
}

export interface ResolvedDropMove {
  parentNodeId: string
  targetIndex: number
}

export interface ResolvedDragTarget {
  targetNodeId: string
  zone: MindMapDropZone
}

const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 44

export function getMindMapDropZone(clientY: number, rectTop: number, rectHeight: number): MindMapDropZone {
  const relativeY = rectHeight === 0 ? clientY / 44 : (clientY - rectTop) / rectHeight
  if (relativeY < 0.25) return 'before'
  if (relativeY > 0.75) return 'after'
  return 'child'
}

export function resolveMindMapDragTarget(
  draggedNode: FlowLikeNode,
  nodes: FlowLikeNode[],
): ResolvedDragTarget | null {
  const draggedWidth = draggedNode.width ?? DEFAULT_NODE_WIDTH
  const draggedHeight = draggedNode.height ?? DEFAULT_NODE_HEIGHT
  const center = {
    x: draggedNode.position.x + draggedWidth / 2,
    y: draggedNode.position.y + draggedHeight / 2,
  }

  for (const node of nodes) {
    if (node.id === draggedNode.id) continue

    const width = node.width ?? DEFAULT_NODE_WIDTH
    const height = node.height ?? DEFAULT_NODE_HEIGHT
    const left = node.position.x
    const top = node.position.y
    const right = left + width
    const bottom = top + height

    if (center.x < left || center.x > right || center.y < top || center.y > bottom) continue

    return {
      targetNodeId: node.id,
      zone: getMindMapDropZone(center.y, top, height),
    }
  }

  return null
}

export function resolveMindMapDropMove(input: ResolveDropMoveInput): ResolvedDropMove | null {
  const { sourceNodeId, targetNodeId, zone, targetParentId, targetIndex, targetChildCount } = input
  if (!sourceNodeId || sourceNodeId === targetNodeId) return null

  if (zone === 'child') {
    return {
      parentNodeId: targetNodeId,
      targetIndex: targetChildCount,
    }
  }

  if (!targetParentId || targetIndex === undefined) return null

  return {
    parentNodeId: targetParentId,
    targetIndex: zone === 'before' ? targetIndex : targetIndex + 1,
  }
}
