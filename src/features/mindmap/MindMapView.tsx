import React from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'

import { useDocumentStore } from '../document/documentStore'
import { useAgentStore } from '../agent/agentStore'
import { useNodeContextMenuController } from '../document/useNodeContextMenuController'
import { MindMapLayoutDiagnostics } from './layoutEngine'
import { MindMapNodeData } from './MindMapNode'
import { formatDeleteConfirmation } from './mindMapActions'
import { MindMapCanvas } from './MindMapCanvas'
import { MindMapEmptyState } from './MindMapEmptyState'
import { MindMapMode } from './MindMapToolbar'
import { MindMapOverlays } from './MindMapOverlays'
import { useMindMapFocus } from './useMindMapFocus'
import { useMindMapSearch } from './useMindMapSearch'
import { useMindMapLayoutActions } from './hooks/useMindMapLayoutActions'
import { useMindMapLayoutComputation } from './hooks/useMindMapLayoutComputation'
import { useMindMapKeyboardShortcuts } from './hooks/useMindMapKeyboardShortcuts'
import { useMindMapEditing } from './hooks/useMindMapEditing'
import { useMindMapGraphSelectors } from './hooks/useMindMapGraphSelectors'
import { useMindMapMeasuredNodeSizes } from './hooks/useMindMapMeasuredNodeSizes'
import { useMindMapStrategyState } from './hooks/useMindMapStrategyState'
import { useMindMapCanvasHandlers } from './hooks/useMindMapCanvasHandlers'
import { useMindMapOverlayHandlers } from './hooks/useMindMapOverlayHandlers'
import { useMindMapLayoutHandlers } from './hooks/useMindMapLayoutHandlers'
import { useMindMapActiveMatchFocus } from './hooks/useMindMapActiveMatchFocus'
import { useMindMapExportController } from './hooks/useMindMapExportController'
import { useMindMapFocusFeedback } from './hooks/useMindMapFocusFeedback'
import { useSettingsStore } from '../settings/settingsStore'
import { useMindMapDragReorg } from './hooks/useMindMapDragReorg'

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
  const experimentalLayoutEnabled = useSettingsStore((s) => s.settings.experimentalMindMapLayoutEngine)

  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [mode, setMode] = React.useState<MindMapMode>('layout')
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false)
  const [layoutDiagnostics, setLayoutDiagnostics] = React.useState<MindMapLayoutDiagnostics | null>(null)
  const flowInstanceRef = React.useRef<ReactFlowInstance | null>(null)
  const flowWrapperRef = React.useRef<HTMLDivElement | null>(null)

  const { measuredNodeSizes, measuredNodeSizeSignature } = useMindMapMeasuredNodeSizes(mode, nodes)
  const {
    editing,
    setEditing,
    startEditing,
    finishEditing,
    cancelEditing,
    clearEditing,
  } = useMindMapEditing({
    selectNode,
    beginTextEditSession,
    commitTextEditSession,
  })

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

  useMindMapFocusFeedback({
    currentDoc,
    focusedNodeId: validFocusRootNodeId,
    setFeedback,
  })

  const {
    depthByNodeId,
    parentByNodeId,
    childIndexByNodeId,
    getNodeDescendantIds,
    visibleNodeIds,
    graphRootNode,
  } = useMindMapGraphSelectors({
    currentDoc,
    collapsedNodeIds,
    validFocusRootNodeId,
  })

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
    layoutStrategy,
    collapsedBranchSides,
    handleStrategyChange,
    toggleBranchSide,
  } = useMindMapStrategyState({
    currentDoc,
    experimentalLayoutEnabled,
    setFeedback,
  })

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

  const layoutHandlers = useMindMapLayoutHandlers({
    toggleBranchSide,
    toggleCollapse,
    updateNodeText,
    finishEditing,
    cancelEditing,
    handleDelete,
    insertSiblingAndEdit,
    insertChildAndEdit,
    indentNode,
    outdentNode,
    moveNode,
    toggleNodeChecked,
  })

  const {
    forcePreview,
    handleAutoLayout,
    handleRelayoutBranch,
    handleUnlockNode,
    handleForceDirectedPreview,
    handleCancelForceDirectedPreview,
    handleApplyForceDirectedPreview,
  } = useMindMapLayoutActions({
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
  })

  const { exportClean } = useMindMapExportController({
    documentTitle: currentDoc?.title ?? '未命名文档',
    nodes,
    flowWrapperRef,
  })

  useMindMapLayoutComputation({
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
    editingNodeId: editing?.nodeId ?? null,
    searchQuery,
    forcePreview,
    handlers: layoutHandlers,
    setNodes,
    setEdges,
    setLayoutDiagnostics,
    setFeedback,
  })

  useMindMapActiveMatchFocus({
    activeMatchNodeId,
    nodes,
    flowInstanceRef,
    selectNode,
  })

  const handleNodesChange = React.useCallback(onNodesChange, [onNodesChange])

  const { handleNodeDrag, handleNodeDragStop } = useMindMapDragReorg({
    nodes,
    setNodes,
    mode,
    currentDoc,
    forcePreviewActive: Boolean(forcePreview),
    parentByNodeId,
    childIndexByNodeId,
    getNodeDescendantIds,
    moveNodeToParent,
    commitMindMapLayout,
    experimentalLayoutEnabled,
    layoutStrategy,
    setFeedback,
  })

  const handleKeyDown = useMindMapKeyboardShortcuts({
    selectedNodeId,
    runAction,
    closeContextMenu,
    clearEditing,
    selectNode,
  })

  const canvasHandlers = useMindMapCanvasHandlers({
    flowInstanceRef,
    selectNode,
    startEditing,
    openContextMenu,
    closeContextMenu,
  })

  const forcePreviewActive = Boolean(forcePreview)
  const overlayHandlers = useMindMapOverlayHandlers({
    contextMenu,
    experimentalLayoutEnabled,
    forcePreviewActive,
    runAction,
    handleFocusBranch,
    handleRelayoutBranch,
    handleUnlockNode,
    closeContextMenu,
    setDiagnosticsOpen,
    setSearchOpen,
    navigateSearch,
  })

  if (!currentDoc) {
    return <MindMapEmptyState />
  }

  const deleteMessage = deleteTarget ? formatDeleteConfirmation(deleteTarget) : null

  return (
    <div className="relative h-full w-full bg-linen">
      <MindMapCanvas
        ref={flowWrapperRef}
        nodes={nodes}
        edges={edges}
        nodesDraggable={!forcePreview}
        onNodeClick={canvasHandlers.handleNodeClick}
        onNodeDoubleClick={canvasHandlers.handleNodeDoubleClick}
        onNodeContextMenu={canvasHandlers.handleNodeContextMenu}
        onPaneClick={canvasHandlers.handlePaneClick}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onKeyDown={handleKeyDown}
        onInit={canvasHandlers.handleInit}
      />
      <MindMapOverlays
        exportClean={exportClean}
        mode={mode}
        focused={Boolean(validFocusRootNodeId)}
        searchOpen={searchOpen}
        experimentalLayoutEnabled={experimentalLayoutEnabled}
        layoutStrategy={layoutStrategy}
        forcePreviewActive={forcePreviewActive}
        feedback={feedback}
        diagnosticsOpen={diagnosticsOpen}
        layoutDiagnostics={layoutDiagnostics}
        searchQuery={searchQuery}
        matchedNodeCount={matchedNodeIds.length}
        activeMatchIndex={activeMatchIndex}
        contextMenu={contextMenu}
        showContextMenu={Boolean(contextNode)}
        isContextNodeCollapsed={contextMenu ? collapsedNodeIds.has(contextMenu.nodeId) : false}
        contextNodeOperationState={contextMenu ? getNodeOperationState(contextMenu.nodeId) : null}
        deleteMessage={deleteMessage}
        onModeChange={setMode}
        onStrategyChange={handleStrategyChange}
        onAutoLayout={handleAutoLayout}
        onForceDirectedPreview={handleForceDirectedPreview}
        onToggleDiagnostics={overlayHandlers.handleToggleDiagnostics}
        onToggleSearch={overlayHandlers.handleToggleSearch}
        onResetFocus={handleResetFocus}
        onApplyForceDirectedPreview={handleApplyForceDirectedPreview}
        onCancelForceDirectedPreview={handleCancelForceDirectedPreview}
        onSearchQueryChange={handleSearchQueryChange}
        onPreviousSearchResult={overlayHandlers.handlePreviousSearchResult}
        onNextSearchResult={overlayHandlers.handleNextSearchResult}
        onCloseSearch={closeSearch}
        onContextMenuAction={overlayHandlers.handleContextMenuAction}
        onFocusContextBranch={overlayHandlers.handleFocusContextBranch}
        onRelayoutContextBranch={overlayHandlers.handleRelayoutContextBranch}
        onUnlockContextNode={overlayHandlers.handleUnlockContextNode}
        onCancelDelete={cancelDelete}
        onConfirmDelete={confirmDelete}
      />
    </div>
  )
}
