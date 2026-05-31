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
  rootNodeId?: string
  descendantNodeIds?: Set<string>
}

export interface ResolvedDropMove {
  parentNodeId: string
  targetIndex: number
}

export interface RejectedDropMove {
  reason: string
}

export interface ResolvedDragTarget {
  targetNodeId: string
  zone: MindMapDropZone
}

export const DEFAULT_MIND_MAP_NODE_WIDTH = 200
export const DEFAULT_MIND_MAP_NODE_HEIGHT = 44

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
  const draggedWidth = draggedNode.width ?? DEFAULT_MIND_MAP_NODE_WIDTH
  const draggedHeight = draggedNode.height ?? DEFAULT_MIND_MAP_NODE_HEIGHT
  const center = {
    x: draggedNode.position.x + draggedWidth / 2,
    y: draggedNode.position.y + draggedHeight / 2,
  }

  for (const node of nodes) {
    if (node.id === draggedNode.id) continue

    const width = node.width ?? DEFAULT_MIND_MAP_NODE_WIDTH
    const height = node.height ?? DEFAULT_MIND_MAP_NODE_HEIGHT
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
  const result = resolveMindMapDropMoveResult(input)
  return 'reason' in result ? null : result
}

export function resolveMindMapDropMoveResult(
  input: ResolveDropMoveInput,
): ResolvedDropMove | RejectedDropMove {
  const {
    sourceNodeId,
    targetNodeId,
    zone,
    targetParentId,
    targetIndex,
    targetChildCount,
    rootNodeId,
    descendantNodeIds,
  } = input
  if (!sourceNodeId) return { reason: '无法移动到该位置' }
  if (sourceNodeId === targetNodeId) return { reason: '无法移动到自身' }
  if (rootNodeId && sourceNodeId === rootNodeId) return { reason: '无法移动根节点' }
  if (descendantNodeIds?.has(targetNodeId)) return { reason: '无法移动到自己的子节点下' }

  if (zone === 'child') {
    return {
      parentNodeId: targetNodeId,
      targetIndex: targetChildCount,
    }
  }

  if (!targetParentId || targetIndex === undefined) return { reason: '无法移动到该位置' }

  return {
    parentNodeId: targetParentId,
    targetIndex: zone === 'before' ? targetIndex : targetIndex + 1,
  }
}
