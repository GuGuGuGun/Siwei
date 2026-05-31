import React from 'react'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Node,
  ReactFlowInstance,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { FileText } from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'
import { createAgentDocumentPreview } from '../agent/agentChangePlan'
import { useAgentStore } from '../agent/agentStore'
import { useNodeContextMenuController } from '../document/useNodeContextMenuController'
import { outlineToGraph } from './outlineToGraph'
import { layoutGraph } from './layoutGraph'
import { MindMapNode, MindMapNodeData } from './MindMapNode'
import { MindMapContextMenu } from './MindMapContextMenu'
import { MindMapDeleteDialog } from './MindMapDeleteDialog'
import { findNodeById, formatDeleteConfirmation } from './mindMapActions'
import { MindMapToolbar, MindMapMode } from './MindMapToolbar'
import { MindMapSearchBar } from './MindMapSearchBar'
import { useMindMapExport } from './useMindMapExport'
import { useMindMapFocus } from './useMindMapFocus'
import { useMindMapSearch } from './useMindMapSearch'
import { useMindMapExportRegistration } from './useMindMapExportRegistration'
import {
  getChildIndexMap,
  getDescendantIds,
  getNodeSubtree,
  getNodeDepthMap,
  getParentIdMap,
  getVisibleMindMapNodeIds,
} from './mindMapSelectors'
import {
  DEFAULT_MIND_MAP_NODE_WIDTH,
  getMindMapDropZone,
  MindMapDropZone,
  resolveMindMapDragTarget,
  resolveMindMapDropMove,
  resolveMindMapDropMoveResult,
} from './mindMapReorder'
import type { AgentInsertionPreview } from '../agent/agentTypes'

interface MindMapEditingState {
  nodeId: string
}

type MindMapDropPreview = { nodeId: string; zone: MindMapDropZone; invalid?: boolean } | null

const nodeTypes = {
  custom: MindMapNode,
  root: MindMapNode,
}

const REORGANIZE_CHILD_PREVIEW_GAP = 32
const AGENT_INSERTION_NODE_PREFIX = 'agent-insertion-preview:'

const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]'))
}

export const MindMapView: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const collapsedNodeIds = useDocumentStore((s) => s.collapsedNodeIds)
  const pendingAgentPlan = useAgentStore((s) => s.pendingPlan)
  const selectedNodeId = useDocumentStore((s) => s.selectedNodeId)
  const focusRequestSeq = useDocumentStore((s) => s.focusRequestSeq)
  const selectNode = useDocumentStore((s) => s.selectNode)
  const updateNodeText = useDocumentStore((s) => s.updateNodeText)
  const toggleCollapse = useDocumentStore((s) => s.toggleCollapse)
  const indentNode = useDocumentStore((s) => s.indentNode)
  const outdentNode = useDocumentStore((s) => s.outdentNode)
  const moveNode = useDocumentStore((s) => s.moveNode)
  const toggleNodeChecked = useDocumentStore((s) => s.toggleNodeChecked)
  const getNodeOperationState = useDocumentStore((s) => s.getNodeOperationState)
  const beginTextEditSession = useDocumentStore((s) => s.beginTextEditSession)
  const commitTextEditSession = useDocumentStore((s) => s.commitTextEditSession)
  const commitMindMapLayout = useDocumentStore((s) => s.commitMindMapLayout)
  const moveNodeToParent = useDocumentStore((s) => s.moveNodeToParent)

  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [editing, setEditing] = React.useState<MindMapEditingState | null>(null)
  const [mode, setMode] = React.useState<MindMapMode>('layout')
  const [exportClean, setExportClean] = React.useState(false)
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const flowInstanceRef = React.useRef<ReactFlowInstance | null>(null)
  const flowWrapperRef = React.useRef<HTMLDivElement | null>(null)
  const dragStartPositionsRef = React.useRef<Map<string, { x: number; y: number }> | null>(null)

  const depthByNodeId = React.useMemo(
    () => currentDoc ? getNodeDepthMap(currentDoc.root) : new Map<string, number>(),
    [currentDoc],
  )

  const parentByNodeId = React.useMemo(
    () => currentDoc ? getParentIdMap(currentDoc.root) : new Map<string, string | null>(),
    [currentDoc],
  )

  const childIndexByNodeId = React.useMemo(
    () => currentDoc ? getChildIndexMap(currentDoc.root) : new Map<string, number>(),
    [currentDoc],
  )

  const agentPreview = React.useMemo(
    () => createAgentDocumentPreview(pendingAgentPlan),
    [pendingAgentPlan],
  )

  const getNodeDescendantIds = React.useCallback((nodeId: string): Set<string> => {
    return currentDoc ? getDescendantIds(currentDoc.root, nodeId) : new Set<string>()
  }, [currentDoc])

  const startEditing = React.useCallback((nodeId: string) => {
    selectNode(nodeId)
    beginTextEditSession(nodeId)
    setEditing({ nodeId })
  }, [beginTextEditSession, selectNode])

  const finishEditing = React.useCallback((nodeId: string) => {
    commitTextEditSession(nodeId)
    setEditing((state) => (state?.nodeId === nodeId ? null : state))
  }, [commitTextEditSession])

  const cancelEditing = React.useCallback(() => {
    if (editing) {
      commitTextEditSession(editing.nodeId)
    }
    setEditing(null)
  }, [commitTextEditSession, editing])

  const {
    validFocusRootNodeId,
    handleFocusBranch,
    handleResetFocus,
    handleAfterDeleteFocus,
  } = useMindMapFocus({
    currentDoc,
    focusRequestSeq,
    selectedNodeId,
    selectNode,
  })

  const focusedNodeTitle = React.useMemo(() => {
    if (!currentDoc || !validFocusRootNodeId) return null
    return findNodeById(currentDoc.root, validFocusRootNodeId)?.text ?? null
  }, [currentDoc, validFocusRootNodeId])

  React.useEffect(() => {
    if (focusedNodeTitle) {
      setFeedback(`已聚焦当前分支：${focusedNodeTitle}`)
    }
  }, [focusedNodeTitle])

  const visibleNodeIds = React.useMemo(() => {
    if (!currentDoc) return new Set<string>()
    return new Set(getVisibleMindMapNodeIds(currentDoc.root, collapsedNodeIds, validFocusRootNodeId))
  }, [collapsedNodeIds, currentDoc, validFocusRootNodeId])

  const graphRootNode = React.useMemo(() => {
    if (!currentDoc) return null
    return validFocusRootNodeId
      ? getNodeSubtree(currentDoc.root, validFocusRootNodeId)
      : currentDoc.root
  }, [currentDoc, validFocusRootNodeId])

  const {
    searchOpen,
    searchQuery,
    activeMatchIndex,
    matchedNodeIds,
    activeMatchNodeId,
    setSearchOpen,
    handleSearchQueryChange,
    navigateSearch,
    closeSearch,
  } = useMindMapSearch({
    root: currentDoc?.root ?? null,
    visibleNodeIds,
  })

  const handleAfterDelete = React.useCallback((deletedNodeId: string) => {
    setEditing(null)
    handleAfterDeleteFocus(deletedNodeId)
  }, [handleAfterDeleteFocus])

  const {
    contextMenu,
    contextNode,
    deleteTarget,
    closeContextMenu,
    openContextMenu,
    runAction,
    confirmDelete,
    cancelDelete,
    insertSiblingAndEdit,
    insertChildAndEdit,
    handleDelete,
  } = useNodeContextMenuController({
    currentDoc,
    onStartEditing: startEditing,
    onAfterDelete: handleAfterDelete,
  })

  React.useEffect(() => {
    if (!currentDoc) return

    const rawGraph = outlineToGraph(graphRootNode ?? currentDoc.root, collapsedNodeIds, visibleNodeIds)
    const graphWithAgentInsertions = addAgentInsertionPreviewGraph(
      rawGraph,
      validFocusRootNodeId ?? currentDoc.root.id,
      exportClean ? [] : agentPreview.insertionsByParentId.get(validFocusRootNodeId ?? currentDoc.root.id) ?? [],
    )
    const layouted = layoutGraph({
      ...graphWithAgentInsertions,
      nodes: graphWithAgentInsertions.nodes.map((node) => {
        const sourceNode = findNodeById(currentDoc.root, node.id)
        const previewInsertion = getAgentInsertionFromGraphNode(node)
        const data: MindMapNodeData = {
          label: previewInsertion?.node.text ?? sourceNode?.text ?? '',
          depth: previewInsertion ? 0 : depthByNodeId.get(node.id) ?? 0,
          childCount: previewInsertion ? 0 : sourceNode?.children.length ?? 0,
          visibleChildCount: previewInsertion ? 0 : sourceNode?.children.filter((child) => visibleNodeIds.has(child.id)).length ?? 0,
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
          editing: editing?.nodeId === node.id,
          onToggleCollapse: toggleCollapse,
          onTextChange: updateNodeText,
          onCommitEdit: finishEditing,
          onCancelEdit: cancelEditing,
          onDeleteEmpty: handleDelete,
          onInsertSibling: insertSiblingAndEdit,
          onInsertChild: insertChildAndEdit,
          onIndent: indentNode,
          onOutdent: outdentNode,
          onMoveUp: (nodeId) => moveNode(nodeId, 'up'),
          onMoveDown: (nodeId) => moveNode(nodeId, 'down'),
          onToggleChecked: toggleNodeChecked,
        }

        return {
          ...node,
          data,
          selected: !exportClean && !previewInsertion && node.id === selectedNodeId,
        }
      }),
    }, {
      savedLayout: currentDoc.mindMapLayout,
      preserveSavedPositions: true,
    })

    setNodes(layouted.nodes)
    setEdges(layouted.edges)
  }, [
    cancelEditing,
    collapsedNodeIds,
    currentDoc,
    activeMatchNodeId,
    depthByNodeId,
    editing?.nodeId,
    exportClean,
    finishEditing,
    agentPreview,
    graphRootNode,
    handleDelete,
    indentNode,
    insertChildAndEdit,
    insertSiblingAndEdit,
    matchedNodeIds,
    moveNode,
    outdentNode,
    selectedNodeId,
    setEdges,
    setNodes,
    toggleCollapse,
    toggleNodeChecked,
    updateNodeText,
    validFocusRootNodeId,
    visibleNodeIds,
  ])

  React.useEffect(() => {
    if (!activeMatchNodeId) return
    selectNode(activeMatchNodeId)
    const node = nodes.find((item) => item.id === activeMatchNodeId)
    if (node) {
      flowInstanceRef.current?.setCenter(
        node.position.x + (node.width ?? DEFAULT_MIND_MAP_NODE_WIDTH) / 2,
        node.position.y + (node.height ?? 44) / 2,
        { duration: 300, zoom: 1 },
      )
    }
  }, [activeMatchNodeId, nodes, selectNode])

  const cleanExportElement = React.useCallback(() => flowWrapperRef.current, [])
  const { status: exportStatus, exportMindMap } = useMindMapExport({
    documentTitle: currentDoc?.title ?? '未命名文档',
    getExportElement: cleanExportElement,
    hasExportableContent: () => nodes.some((node) => !isAgentInsertionNodeId(node.id)),
  })

  const handleExport = React.useCallback(async (format: 'png' | 'pdf') => {
    setExportClean(true)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    await exportMindMap(format)
    setExportClean(false)
  }, [exportMindMap])

  useMindMapExportRegistration({
    active: true,
    status: exportStatus,
    exportMindMap: (format) => void handleExport(format),
  })

  const handleNodesChange = React.useCallback(onNodesChange, [onNodesChange])

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
    updateDropPreview,
  ])

  const handleNodeDragStop = React.useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    if (!currentDoc) return
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
    const delta = existingNode
      ? {
        x: draggedNode.position.x - existingNode.position.x,
        y: draggedNode.position.y - existingNode.position.y,
      }
      : { x: 0, y: 0 }

    const layout = nodes.reduce<Record<string, { x: number; y: number }>>((nextLayout, node) => {
      const position = node.id === draggedNode.id
        ? draggedNode.position
        : descendantIds.has(node.id)
          ? { x: node.position.x + delta.x, y: node.position.y + delta.y }
          : node.position

      nextLayout[node.id] = { x: position.x, y: position.y }
      return nextLayout
    }, {})

    commitMindMapLayout(layout)
    setFeedback('布局已更新')
  }, [
    childIndexByNodeId,
    commitMindMapLayout,
    currentDoc,
    getNodeDescendantIds,
    mode,
    moveNodeToParent,
    nodes,
    parentByNodeId,
    resolveDraggedNodeTarget,
    updateDropPreview,
  ])

  const handleAutoLayout = React.useCallback(() => {
    if (!currentDoc) return
    if (currentDoc.mindMapLayout && !window.confirm('自动布局会覆盖当前手动布局，是否继续？')) {
      return
    }
    const rawGraph = outlineToGraph(graphRootNode ?? currentDoc.root, collapsedNodeIds, visibleNodeIds)
    const layouted = layoutGraph(rawGraph, { preserveSavedPositions: false })
    const nextLayout = {
      ...(currentDoc.mindMapLayout ?? {}),
      ...layouted.nodes.reduce<Record<string, { x: number; y: number }>>((layout, node) => {
      layout[node.id] = node.position
      return layout
      }, {}),
    }
    commitMindMapLayout(nextLayout)
    setFeedback('布局已更新')
  }, [collapsedNodeIds, commitMindMapLayout, currentDoc, graphRootNode, visibleNodeIds])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeContextMenu])

  if (!currentDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-linen text-zinc-400">
        <FileText size={42} className="mb-3 text-zinc-300" />
        <p className="font-mono text-xs font-semibold tracking-wider">请选择一个织物卡以查看导图</p>
      </div>
    )
  }

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    if (isAgentInsertionNodeId(node.id)) return
    selectNode(node.id)
  }

  const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
    if (isAgentInsertionNodeId(node.id)) return
    startEditing(node.id)
  }

  const handleNodeContextMenu = (event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    if (isAgentInsertionNodeId(node.id)) return
    openContextMenu(node.id, event.clientX, event.clientY)
  }

  const handlePaneClick = () => {
    closeContextMenu()
    selectNode(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isTextInputTarget(event.target) || !selectedNodeId) return

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      runAction(selectedNodeId, 'toggleChecked')
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowUp') {
      event.preventDefault()
      runAction(selectedNodeId, 'moveUp')
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowDown') {
      event.preventDefault()
      runAction(selectedNodeId, 'moveDown')
      return
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        runAction(selectedNodeId, event.shiftKey ? 'insertChild' : 'insertSibling')
        break
      case 'Tab':
        event.preventDefault()
        runAction(selectedNodeId, event.shiftKey ? 'outdent' : 'indent')
        break
      case 'Escape':
        event.preventDefault()
        closeContextMenu()
        setEditing(null)
        selectNode(null)
        break
    }
  }

  return (
    <div className="relative h-full w-full bg-linen">
      <div ref={flowWrapperRef} className="h-full w-full">
        <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onKeyDown={handleKeyDown}
        onInit={(instance) => {
          flowInstanceRef.current = instance
        }}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        className="text-zinc-700"
      >
        <Controls className="!bg-[#FAF8F4] !border-amber-900/10 !shadow-fabric [&>button]:!border-amber-900/5 [&>button]:hover:!bg-[#EFECE3]" />
        <MiniMap
          style={{
            width: 132,
            height: 92,
            background: 'rgba(250, 248, 244, 0.72)',
            border: '1px dashed rgba(139, 90, 43, 0.16)',
            borderRadius: '10px',
            boxShadow: '0 8px 22px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}
          position="bottom-right"
          nodeColor="#FAF6EC"
          nodeStrokeColor="rgba(139, 90, 43, 0.18)"
          nodeStrokeWidth={1}
          nodeBorderRadius={6}
          maskColor="rgba(240, 235, 220, 0.24)"
          maskStrokeColor="rgba(139, 90, 43, 0.08)"
          className="siwei-mindmap-minimap opacity-60 transition-opacity hover:opacity-95"
        />
        <Background color="#FAF8F4" gap={16} size={1} />
        </ReactFlow>
      </div>
      {!exportClean && (
        <MindMapToolbar
          mode={mode}
          focused={Boolean(validFocusRootNodeId)}
          searchOpen={searchOpen}
          onModeChange={setMode}
          onAutoLayout={handleAutoLayout}
          onToggleSearch={() => setSearchOpen((open) => !open)}
          onResetFocus={handleResetFocus}
        />
      )}
      {feedback && !exportClean && (
        <div className="absolute left-4 top-[4.75rem] z-10 max-w-[calc(100%-2rem)] rounded-md border border-amber-900/10 bg-[#FAF8F4]/95 px-3 py-2 text-xs font-medium text-zinc-600 shadow-fabric">
          {feedback}
        </div>
      )}
      {searchOpen && !exportClean && (
        <MindMapSearchBar
          query={searchQuery}
          matchCount={matchedNodeIds.length}
          activeIndex={Math.max(activeMatchIndex, 0)}
          onQueryChange={handleSearchQueryChange}
          onPrevious={() => navigateSearch(-1)}
          onNext={() => navigateSearch(1)}
          onClose={closeSearch}
        />
      )}
      {contextMenu && contextNode && (
        <MindMapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCollapsed={collapsedNodeIds.has(contextMenu.nodeId)}
          operationState={getNodeOperationState(contextMenu.nodeId)}
          onAction={(action) => runAction(contextMenu.nodeId, action)}
          onFocusBranch={() => {
            handleFocusBranch(contextMenu.nodeId)
            closeContextMenu()
          }}
        />
      )}

      {deleteTarget && (
        <MindMapDeleteDialog
          message={formatDeleteConfirmation(deleteTarget)}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function addAgentInsertionPreviewGraph(
  graph: ReturnType<typeof outlineToGraph>,
  rootNodeId: string,
  rootInsertions: AgentInsertionPreview[],
): ReturnType<typeof outlineToGraph> {
  if (rootInsertions.length === 0) return graph

  const previewNodes = rootInsertions.map((insertion) => ({
    id: createAgentInsertionNodeId(insertion.node.id),
    position: { x: 0, y: 0 },
    data: { label: insertion.node.text || '空白节点', agentInsertion: insertion },
    type: 'custom',
  }))
  const previewEdges = rootInsertions.map((insertion) => ({
    id: `${rootNodeId}-${createAgentInsertionNodeId(insertion.node.id)}`,
    source: rootNodeId,
    target: createAgentInsertionNodeId(insertion.node.id),
    type: 'smoothstep',
    style: { stroke: '#059669', strokeWidth: 1.8, strokeDasharray: '4 4' },
  }))

  return {
    nodes: [...graph.nodes, ...previewNodes],
    edges: [...graph.edges, ...previewEdges],
  }
}

function createAgentInsertionNodeId(nodeId: string): string {
  return `${AGENT_INSERTION_NODE_PREFIX}${nodeId}`
}

function isAgentInsertionNodeId(nodeId: string): boolean {
  return nodeId.startsWith(AGENT_INSERTION_NODE_PREFIX)
}

function getAgentInsertionFromGraphNode(node: Node): AgentInsertionPreview | null {
  const data = node.data as { agentInsertion?: AgentInsertionPreview } | undefined
  return data?.agentInsertion ?? null
}
