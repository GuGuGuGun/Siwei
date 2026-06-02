import React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Edge, Node } from 'reactflow'
import type { MindMapLayoutStrategy, MindMapLayoutState, OutlineNode } from '../../../types/document'
import { createAgentDocumentPreview } from '../../agent/agentChangePlan'
import type { AgentDocumentPreview } from '../../agent/agentTypes'
import { findNodeById } from '../mindMapActions'
import { outlineToGraph } from '../outlineToGraph'
import {
  attachAgentInsertionPreviewGraphData,
  createAgentInsertionPreviewRoot,
  getAgentInsertionDepthFromGraphNode,
  getAgentInsertionFromGraphNode,
} from '../agentInsertionPreviewBuilder'
import { createBranchSideKey, filterCollapsedBranchSides } from '../branchSideCollapse'
import { attachLayoutNodeSizes, buildMindMapNodeSizes } from '../nodeDataAssembler'
import {
  layoutMindMap,
  type MindMapLayoutDiagnostics,
  type MindMapLayoutInput,
  type MindMapLayoutResult,
  type MindMapNodeSize,
} from '../layoutEngine'
import type { MindMapNodeData } from '../MindMapNode'
import { DEFAULT_MIND_MAP_LAYOUT_STRATEGY } from '../mindMapLayoutState'

export interface MindMapLayoutHandlers {
  toggleBranchSide: MindMapNodeData['onToggleBranchSide']
  toggleCollapse: MindMapNodeData['onToggleCollapse']
  updateNodeText: MindMapNodeData['onTextChange']
  finishEditing: MindMapNodeData['onCommitEdit']
  cancelEditing: MindMapNodeData['onCancelEdit']
  handleDelete: MindMapNodeData['onDeleteEmpty']
  insertSiblingAndEdit: MindMapNodeData['onInsertSibling']
  insertChildAndEdit: MindMapNodeData['onInsertChild']
  indentNode: MindMapNodeData['onIndent']
  outdentNode: MindMapNodeData['onOutdent']
  moveNode: (nodeId: string, direction: 'up' | 'down') => void
  toggleNodeChecked: MindMapNodeData['onToggleChecked']
}

interface UseMindMapLayoutComputationParams {
  currentDoc: { root: OutlineNode; mindMapLayout?: MindMapLayoutState } | null
  pendingAgentPlan: Parameters<typeof createAgentDocumentPreview>[0]
  collapsedNodeIds: Set<string>
  validFocusRootNodeId: string | null
  exportClean: boolean
  graphRootNode: OutlineNode | null
  measuredNodeSizes: Record<string, MindMapNodeSize>
  measuredNodeSizeSignature: string
  experimentalLayoutEnabled: boolean
  layoutStrategy: MindMapLayoutStrategy
  depthByNodeId: Map<string, number>
  visibleNodeIds: Set<string>
  collapsedBranchSides: Set<string>
  activeMatchNodeId: string | null
  matchedNodeIds: string[]
  selectedNodeId: string | null
  editingNodeId: string | null
  searchQuery: string
  forcePreview: MindMapLayoutResult | null
  handlers: MindMapLayoutHandlers
  setNodes: Dispatch<SetStateAction<Node<MindMapNodeData>[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setLayoutDiagnostics: Dispatch<SetStateAction<MindMapLayoutDiagnostics | null>>
  setFeedback: (message: string) => void
}

export function useMindMapLayoutComputation({
  currentDoc,
  pendingAgentPlan,
  collapsedNodeIds,
  validFocusRootNodeId,
  exportClean,
  graphRootNode,
  measuredNodeSizes,
  measuredNodeSizeSignature,
  experimentalLayoutEnabled,
  layoutStrategy,
  depthByNodeId,
  visibleNodeIds,
  collapsedBranchSides,
  activeMatchNodeId,
  matchedNodeIds,
  selectedNodeId,
  editingNodeId,
  searchQuery,
  forcePreview,
  handlers,
  setNodes,
  setEdges,
  setLayoutDiagnostics,
  setFeedback,
}: UseMindMapLayoutComputationParams): AgentDocumentPreview {
  const agentPreview = React.useMemo(
    () => createAgentDocumentPreview(pendingAgentPlan),
    [pendingAgentPlan],
  )

  const previewLayoutRoot = React.useMemo(() => {
    const root = graphRootNode ?? currentDoc?.root
    if (!root || exportClean || agentPreview.insertionsByParentId.size === 0) return root ?? null

    // Agent 插入预览需要临时混入待插入节点，让布局和连线能按最终树形提前展示。
    return createAgentInsertionPreviewRoot(root, agentPreview.insertionsByParentId)
  }, [agentPreview.insertionsByParentId, currentDoc?.root, exportClean, graphRootNode])

  React.useEffect(() => {
    if (!currentDoc) return

    const activeStrategy = experimentalLayoutEnabled ? layoutStrategy : DEFAULT_MIND_MAP_LAYOUT_STRATEGY
    const layoutRoot = previewLayoutRoot ?? graphRootNode ?? currentDoc.root
    const rawGraph = outlineToGraph(layoutRoot, collapsedNodeIds, undefined)
    const nodeSizes = buildMindMapNodeSizes(layoutRoot, measuredNodeSizes)
    // 先生成含预览节点的图，再统一交给布局引擎，避免预览节点绕过折叠、聚焦和搜索状态。
    const graphWithAgentInsertions = attachAgentInsertionPreviewGraphData(
      rawGraph,
      agentPreview.insertionsByParentId,
    )
    const layoutInput: MindMapLayoutInput = {
      root: layoutRoot,
      graphData: {
        ...graphWithAgentInsertions,
        nodes: graphWithAgentInsertions.nodes.map((node) => {
          const sourceNode = findNodeById(currentDoc.root, node.id)
          const previewInsertion = getAgentInsertionFromGraphNode(node)
          const data: MindMapNodeData = {
            label: previewInsertion?.node.text ?? sourceNode?.text ?? '',
            depth: previewInsertion ? getAgentInsertionDepthFromGraphNode(node) : depthByNodeId.get(node.id) ?? 0,
            childCount: previewInsertion ? previewInsertion.node.children?.length ?? 0 : sourceNode?.children.length ?? 0,
            visibleChildCount: previewInsertion ? previewInsertion.node.children?.length ?? 0 : sourceNode?.children.filter((child) => visibleNodeIds.has(child.id)).length ?? 0,
            collapsed: previewInsertion ? false : Boolean(sourceNode && collapsedNodeIds.has(sourceNode.id)),
            focused: !previewInsertion && node.id === validFocusRootNodeId,
            matched: !previewInsertion && !exportClean && matchedNodeIds.includes(node.id),
            activeMatch: !previewInsertion && !exportClean && node.id === activeMatchNodeId,
            hasTags: !previewInsertion && Boolean(sourceNode?.tags?.length),
            exportClean,
            checked: previewInsertion ? undefined : sourceNode?.checked,
            agentPreview: previewInsertion || exportClean ? undefined : agentPreview.nodePreviews.get(node.id),
            agentInsertion: !exportClean && Boolean(previewInsertion),
            dropState: null,
            editing: editingNodeId === node.id,
            leftBranchCollapsed: collapsedBranchSides.has(createBranchSideKey(node.id, 'left')),
            rightBranchCollapsed: collapsedBranchSides.has(createBranchSideKey(node.id, 'right')),
            onToggleBranchSide: handlers.toggleBranchSide,
            onToggleCollapse: handlers.toggleCollapse,
            onTextChange: handlers.updateNodeText,
            onCommitEdit: handlers.finishEditing,
            onCancelEdit: handlers.cancelEditing,
            onDeleteEmpty: handlers.handleDelete,
            onInsertSibling: handlers.insertSiblingAndEdit,
            onInsertChild: handlers.insertChildAndEdit,
            onIndent: handlers.indentNode,
            onOutdent: handlers.outdentNode,
            onMoveUp: (nodeId) => handlers.moveNode(nodeId, 'up'),
            onMoveDown: (nodeId) => handlers.moveNode(nodeId, 'down'),
            onToggleChecked: handlers.toggleNodeChecked,
          }

          return {
            ...node,
            data,
            selected: !exportClean && !previewInsertion && node.id === selectedNodeId,
          }
        }),
      },
      collapsedNodeIds,
      visibleNodeIds: new Set(graphWithAgentInsertions.nodes.map((node) => node.id)),
      strategy: activeStrategy,
      persistedLayout: currentDoc.mindMapLayout,
      nodeSizes,
      mode: validFocusRootNodeId || searchQuery || agentPreview.insertionsByParentId.size > 0 ? 'transient' : 'persistent',
    }
    const initialLayouted = forcePreview ?? layoutMindMap(layoutInput)
    const sideFilteredGraph = filterCollapsedBranchSides(
      layoutInput.graphData,
      initialLayouted.edges,
      collapsedBranchSides,
    )
    // 分支侧折叠依赖第一次布局后的连线方向，过滤节点后需要重新布局以收拢剩余分支。
    const layouted = sideFilteredGraph === layoutInput.graphData
      ? initialLayouted
      : layoutMindMap({
        ...layoutInput,
        graphData: sideFilteredGraph,
        visibleNodeIds: new Set(sideFilteredGraph.nodes.map((node) => node.id)),
      })

    if (layouted.diagnostics) {
      setLayoutDiagnostics(layouted.diagnostics)
      if (layouted.diagnostics.fallbackReason) {
        setFeedback(layouted.diagnostics.fallbackReason)
      }
    }

    setNodes(attachLayoutNodeSizes(layouted.nodes, nodeSizes))
    setEdges(layouted.edges)
  }, [
    activeMatchNodeId,
    agentPreview,
    collapsedBranchSides,
    collapsedNodeIds,
    currentDoc,
    depthByNodeId,
    editingNodeId,
    experimentalLayoutEnabled,
    exportClean,
    forcePreview,
    graphRootNode,
    handlers,
    layoutStrategy,
    matchedNodeIds,
    measuredNodeSizeSignature,
    previewLayoutRoot,
    searchQuery,
    selectedNodeId,
    setEdges,
    setFeedback,
    setLayoutDiagnostics,
    setNodes,
    validFocusRootNodeId,
    visibleNodeIds,
  ])

  return agentPreview
}
