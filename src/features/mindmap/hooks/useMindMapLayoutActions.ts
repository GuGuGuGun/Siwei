import React from 'react'
import type { Node } from 'reactflow'
import type { MindMapLayoutState, MindMapLayoutStrategy, OutlineDocument } from '../../../types/document'
import { outlineToGraph } from '../outlineToGraph'
import {
  applyForceDirectedLayoutPreview,
  layoutMindMap,
  relayoutMindMapBranch,
  type MindMapLayoutResult,
  type MindMapNodeSize,
} from '../layoutEngine'
import {
  createMindMapLayoutState,
  DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
} from '../mindMapLayoutState'
import { buildMindMapNodeSizes } from '../nodeDataAssembler'
import type { MindMapNodeData } from '../MindMapNode'

interface UseMindMapLayoutActionsParams {
  currentDoc: OutlineDocument | null
  graphRootNode: OutlineDocument['root'] | null
  collapsedNodeIds: Set<string>
  visibleNodeIds: Set<string>
  nodes: Node<MindMapNodeData>[]
  measuredNodeSizes: Record<string, MindMapNodeSize>
  experimentalLayoutEnabled: boolean
  layoutStrategy: MindMapLayoutStrategy
  commitMindMapLayout: (layout: MindMapLayoutState) => void
  setFeedback: (message: string) => void
}

export function useMindMapLayoutActions({
  currentDoc,
  graphRootNode,
  collapsedNodeIds,
  visibleNodeIds,
  nodes,
  measuredNodeSizes,
  experimentalLayoutEnabled,
  layoutStrategy,
  commitMindMapLayout,
  setFeedback,
}: UseMindMapLayoutActionsParams) {
  const [forcePreview, setForcePreview] = React.useState<MindMapLayoutResult | null>(null)

  const activeStrategy = experimentalLayoutEnabled ? layoutStrategy : DEFAULT_MIND_MAP_LAYOUT_STRATEGY

  const createCurrentNodePositions = React.useCallback(() => {
    return nodes.reduce<Record<string, { x: number; y: number }>>((positions, node) => {
      positions[node.id] = node.position
      return positions
    }, {})
  }, [nodes])

  const handleAutoLayout = React.useCallback(() => {
    if (!currentDoc) return
    if (currentDoc.mindMapLayout && !window.confirm('自动布局会覆盖当前手动布局，是否继续？')) {
      return
    }

    const layoutRoot = graphRootNode ?? currentDoc.root
    const rawGraph = outlineToGraph(layoutRoot, collapsedNodeIds, visibleNodeIds)
    const nodeSizes = buildMindMapNodeSizes(layoutRoot, measuredNodeSizes)
    const layouted = layoutMindMap({
      root: layoutRoot,
      graphData: rawGraph,
      collapsedNodeIds,
      visibleNodeIds,
      strategy: activeStrategy,
      nodeSizes,
      mode: 'persistent',
    })
    const positions = layouted.nodes.reduce<Record<string, { x: number; y: number }>>((layout, node) => {
      layout[node.id] = node.position
      return layout
    }, {})
    commitMindMapLayout(createMindMapLayoutState(positions, { strategy: activeStrategy, source: 'auto' }))
    setFeedback('布局已更新')
  }, [
    activeStrategy,
    collapsedNodeIds,
    commitMindMapLayout,
    currentDoc,
    graphRootNode,
    measuredNodeSizes,
    setFeedback,
    visibleNodeIds,
  ])

  const handleRelayoutBranch = React.useCallback((nodeId: string) => {
    if (!currentDoc?.mindMapLayout) return
    commitMindMapLayout(relayoutMindMapBranch({
      root: currentDoc.root,
      branchRootId: nodeId,
      layout: currentDoc.mindMapLayout,
      nodeSizes: buildMindMapNodeSizes(currentDoc.root, measuredNodeSizes),
      strategy: activeStrategy,
    }))
    setFeedback('已重排当前分支')
  }, [activeStrategy, commitMindMapLayout, currentDoc, measuredNodeSizes, setFeedback])

  const handleUnlockNode = React.useCallback((nodeId: string) => {
    if (!currentDoc?.mindMapLayout?.nodes[nodeId]) return
    commitMindMapLayout({
      ...currentDoc.mindMapLayout,
      nodes: {
        ...currentDoc.mindMapLayout.nodes,
        [nodeId]: {
          ...currentDoc.mindMapLayout.nodes[nodeId],
          locked: false,
        },
      },
    })
    setFeedback('已解锁当前节点')
  }, [commitMindMapLayout, currentDoc, setFeedback])

  const handleForceDirectedPreview = React.useCallback(() => {
    if (!currentDoc) return
    const layoutRoot = graphRootNode ?? currentDoc.root
    const baseLayout = currentDoc.mindMapLayout ?? createMindMapLayoutState(
      createCurrentNodePositions(),
      { strategy: activeStrategy },
    )
    const preview = applyForceDirectedLayoutPreview({
      root: layoutRoot,
      layout: baseLayout,
      nodeSizes: buildMindMapNodeSizes(layoutRoot, measuredNodeSizes),
      params: { strength: 2, spread: 2, quality: 2 },
      mode: 'preview',
    })
    setForcePreview(preview)
    setFeedback('已进入力导向预览')
  }, [activeStrategy, createCurrentNodePositions, currentDoc, graphRootNode, measuredNodeSizes, setFeedback])

  const handleCancelForceDirectedPreview = React.useCallback(() => {
    setForcePreview(null)
    setFeedback('已取消力导向预览')
  }, [setFeedback])

  const handleApplyForceDirectedPreview = React.useCallback(() => {
    if (!currentDoc) return
    const layoutRoot = graphRootNode ?? currentDoc.root
    const baseLayout = currentDoc.mindMapLayout ?? createMindMapLayoutState(
      createCurrentNodePositions(),
      { strategy: activeStrategy },
    )
    const applied = applyForceDirectedLayoutPreview({
      root: layoutRoot,
      layout: baseLayout,
      nodeSizes: buildMindMapNodeSizes(layoutRoot, measuredNodeSizes),
      params: { strength: 2, spread: 2, quality: 2 },
      mode: 'apply',
    })
    if (applied.layoutState) {
      commitMindMapLayout(applied.layoutState)
    }
    setForcePreview(null)
    setFeedback('已应用力导向布局')
  }, [
    activeStrategy,
    commitMindMapLayout,
    createCurrentNodePositions,
    currentDoc,
    graphRootNode,
    measuredNodeSizes,
    setFeedback,
  ])

  return {
    forcePreview,
    handleAutoLayout,
    handleRelayoutBranch,
    handleUnlockNode,
    handleForceDirectedPreview,
    handleCancelForceDirectedPreview,
    handleApplyForceDirectedPreview,
  }
}
