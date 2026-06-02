import React from 'react'
import type { Node } from 'reactflow'
import type { MindMapLayoutStrategy, MindMapLayoutState, OutlineNode } from '../../../types/document'
import { findNodeById } from '../mindMapActions'
import {
  DEFAULT_MIND_MAP_NODE_WIDTH,
  MindMapDropZone,
  resolveMindMapDragTarget,
  resolveMindMapDropMove,
  resolveMindMapDropMoveResult,
} from '../mindMapReorder'
import {
  createMindMapLayoutState,
  DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
} from '../mindMapLayoutState'
import type { MindMapMode } from '../MindMapToolbar'
import type { MindMapNodeData } from '../MindMapNode'

type MindMapDropPreview = { nodeId: string; zone: MindMapDropZone; invalid?: boolean } | null

interface UseMindMapDragReorgParams {
  nodes: Node<MindMapNodeData>[]
  setNodes: React.Dispatch<React.SetStateAction<Node<MindMapNodeData>[]>>
  mode: MindMapMode
  currentDoc: { root: OutlineNode; mindMapLayout?: MindMapLayoutState } | null
  forcePreviewActive: boolean
  parentByNodeId: Map<string, string | null>
  childIndexByNodeId: Map<string, number>
  getNodeDescendantIds: (nodeId: string) => Set<string>
  moveNodeToParent: (sourceNodeId: string, targetParentNodeId: string, targetIndex: number) => void
  commitMindMapLayout: (layout: MindMapLayoutState) => void
  experimentalLayoutEnabled: boolean
  layoutStrategy: MindMapLayoutStrategy
  setFeedback: (message: string) => void
}

const REORGANIZE_CHILD_PREVIEW_GAP = 32

export function useMindMapDragReorg({
  nodes,
  setNodes,
  mode,
  currentDoc,
  forcePreviewActive,
  parentByNodeId,
  childIndexByNodeId,
  getNodeDescendantIds,
  moveNodeToParent,
  commitMindMapLayout,
  experimentalLayoutEnabled,
  layoutStrategy,
  setFeedback,
}: UseMindMapDragReorgParams) {
  const dragStartPositionsRef = React.useRef<Map<string, { x: number; y: number }> | null>(null)

  const updateDropPreview = React.useCallback((preview: MindMapDropPreview, draggedNode?: Node) => {
    setNodes((currentNodes) => {
      const sourcePositions = dragStartPositionsRef.current
      const previewTarget = preview?.zone === 'child'
        ? currentNodes.find((node) => node.id === preview.nodeId)
        : null
      const previewDescendantIds = previewTarget ? getNodeDescendantIds(previewTarget.id) : new Set<string>()
      const previewShiftX = previewTarget
        ? (draggedNode?.width ?? DEFAULT_MIND_MAP_NODE_WIDTH) + REORGANIZE_CHILD_PREVIEW_GAP
        : 0

      return currentNodes.map((node) => {
        const basePosition = sourcePositions?.get(node.id) ?? node.position
        const shouldShiftForChildPreview = previewTarget !== null && previewDescendantIds.has(node.id)
        // 子节点投放预览会临时推开目标子树，给用户留出“将成为父子关系”的空间提示。
        const nextPosition = draggedNode?.id === node.id
          ? draggedNode.position
          : shouldShiftForChildPreview
            ? { x: basePosition.x + previewShiftX, y: basePosition.y }
            : basePosition

        return {
          ...node,
          position: nextPosition,
          width: draggedNode?.id === node.id ? draggedNode.width ?? node.width : node.width,
          height: draggedNode?.id === node.id ? draggedNode.height ?? node.height : node.height,
          data: {
            ...node.data,
            dropState: preview?.nodeId === node.id && !preview.invalid ? preview.zone : null,
            invalidDrop: preview?.nodeId === node.id && Boolean(preview.invalid),
          },
        }
      })
    })
  }, [getNodeDescendantIds, setNodes])

  React.useEffect(() => {
    if (mode === 'layout') {
      updateDropPreview(null)
    }
  }, [mode, updateDropPreview])

  const resolveDraggedNodeTarget = React.useCallback((draggedNode: Node) => {
    return resolveMindMapDragTarget(draggedNode, nodes)
  }, [nodes])

  const handleNodeDrag = React.useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    if (mode !== 'reorganize') return
    if (!dragStartPositionsRef.current) {
      dragStartPositionsRef.current = new Map(nodes.map((node) => [node.id, node.position]))
    }
    const dragTarget = resolveDraggedNodeTarget(draggedNode)
    const targetNode = dragTarget && currentDoc ? findNodeById(currentDoc.root, dragTarget.targetNodeId) : null
    const resolvedMove = dragTarget && currentDoc
      ? resolveMindMapDropMove({
        sourceNodeId: draggedNode.id,
        targetNodeId: dragTarget.targetNodeId,
        zone: dragTarget.zone,
        targetParentId: parentByNodeId.get(dragTarget.targetNodeId),
        targetIndex: childIndexByNodeId.get(dragTarget.targetNodeId),
        targetChildCount: targetNode?.children.length ?? 0,
        rootNodeId: currentDoc.root.id,
        descendantNodeIds: getNodeDescendantIds(draggedNode.id),
      })
      : null
    updateDropPreview(
      dragTarget ? { nodeId: dragTarget.targetNodeId, zone: dragTarget.zone, invalid: !resolvedMove } : null,
      draggedNode,
    )
    if (dragTarget && currentDoc && !resolvedMove) {
      const result = resolveMindMapDropMoveResult({
        sourceNodeId: draggedNode.id,
        targetNodeId: dragTarget.targetNodeId,
        zone: dragTarget.zone,
        targetParentId: parentByNodeId.get(dragTarget.targetNodeId),
        targetIndex: childIndexByNodeId.get(dragTarget.targetNodeId),
        targetChildCount: targetNode?.children.length ?? 0,
        rootNodeId: currentDoc.root.id,
        descendantNodeIds: getNodeDescendantIds(draggedNode.id),
      })
      if ('reason' in result) setFeedback(result.reason)
    }
  }, [
    childIndexByNodeId,
    currentDoc,
    getNodeDescendantIds,
    mode,
    nodes,
    parentByNodeId,
    resolveDraggedNodeTarget,
    setFeedback,
    updateDropPreview,
  ])

  const handleNodeDragStop = React.useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    if (!currentDoc) return
    if (forcePreviewActive) {
      setFeedback('力导向预览中不能编辑结构')
      return
    }
    if (mode === 'reorganize') {
      const dragTarget = resolveDraggedNodeTarget(draggedNode)
      updateDropPreview(null, draggedNode)
      dragStartPositionsRef.current = null
      if (!dragTarget) return

      const targetNode = findNodeById(currentDoc.root, dragTarget.targetNodeId)
      const resolvedMove = resolveMindMapDropMove({
        sourceNodeId: draggedNode.id,
        targetNodeId: dragTarget.targetNodeId,
        zone: dragTarget.zone,
        targetParentId: parentByNodeId.get(dragTarget.targetNodeId),
        targetIndex: childIndexByNodeId.get(dragTarget.targetNodeId),
        targetChildCount: targetNode?.children.length ?? 0,
        rootNodeId: currentDoc.root.id,
        descendantNodeIds: getNodeDescendantIds(draggedNode.id),
      })
      if (!resolvedMove) return

      moveNodeToParent(draggedNode.id, resolvedMove.parentNodeId, resolvedMove.targetIndex)
      const parentTitle = findNodeById(currentDoc.root, resolvedMove.parentNodeId)?.text ?? '目标节点'
      setFeedback(`已移动到「${parentTitle}」`)
      return
    }

    const descendantIds = getNodeDescendantIds(draggedNode.id)
    const existingNode = nodes.find((node) => node.id === draggedNode.id)
    // 自由布局模式下拖动父节点时，同步平移其后代，保持用户手动整理出的局部结构。
    const delta = existingNode
      ? {
        x: draggedNode.position.x - existingNode.position.x,
        y: draggedNode.position.y - existingNode.position.y,
      }
      : { x: 0, y: 0 }

    const positions = nodes.reduce<Record<string, { x: number; y: number }>>((nextLayout, node) => {
      const position = node.id === draggedNode.id
        ? draggedNode.position
        : descendantIds.has(node.id)
          ? { x: node.position.x + delta.x, y: node.position.y + delta.y }
          : node.position

      nextLayout[node.id] = { x: position.x, y: position.y }
      return nextLayout
    }, {})

    commitMindMapLayout(createMindMapLayoutState(positions, {
      strategy: experimentalLayoutEnabled ? layoutStrategy : DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
      lockedNodeIds: new Set([draggedNode.id]),
      previous: currentDoc.mindMapLayout,
    }))
    setFeedback('布局已更新')
  }, [
    childIndexByNodeId,
    commitMindMapLayout,
    currentDoc,
    experimentalLayoutEnabled,
    forcePreviewActive,
    getNodeDescendantIds,
    layoutStrategy,
    mode,
    moveNodeToParent,
    nodes,
    parentByNodeId,
    resolveDraggedNodeTarget,
    setFeedback,
    updateDropPreview,
  ])

  return {
    handleNodeDrag,
    handleNodeDragStop,
  }
}
