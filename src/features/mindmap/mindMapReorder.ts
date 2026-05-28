export type MindMapDropZone = 'before' | 'child' | 'after'

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

export function getMindMapDropZone(clientY: number, rectTop: number, rectHeight: number): MindMapDropZone {
  const relativeY = rectHeight === 0 ? clientY / 44 : (clientY - rectTop) / rectHeight
  if (relativeY < 0.25) return 'before'
  if (relativeY > 0.75) return 'after'
  return 'child'
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
