import React from 'react'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Node,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { FileText, GitBranch, LayoutDashboard, Move } from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'
import { useNodeContextMenuController } from '../document/useNodeContextMenuController'
import { outlineToGraph } from './outlineToGraph'
import { layoutGraph } from './layoutGraph'
import { MindMapNode, MindMapNodeData } from './MindMapNode'
import { MindMapContextMenu } from './MindMapContextMenu'
import { MindMapDeleteDialog } from './MindMapDeleteDialog'
import { findNodeById, formatDeleteConfirmation } from './mindMapActions'
import {
  DEFAULT_MIND_MAP_NODE_WIDTH,
  getMindMapDropZone,
  MindMapDropZone,
  resolveMindMapDragTarget,
  resolveMindMapDropMove,
} from './mindMapReorder'

interface MindMapEditingState {
  nodeId: string
}

type MindMapMode = 'layout' | 'reorganize'
type MindMapDropPreview = { nodeId: string; zone: MindMapDropZone } | null

const nodeTypes = {
  custom: MindMapNode,
  root: MindMapNode,
}

const REORGANIZE_CHILD_PREVIEW_GAP = 32

const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]'))
}

export const MindMapView: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const collapsedNodeIds = useDocumentStore((s) => s.collapsedNodeIds)
  const selectedNodeId = useDocumentStore((s) => s.selectedNodeId)
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
  const dragStartPositionsRef = React.useRef<Map<string, { x: number; y: number }> | null>(null)

  const parentByNodeId = React.useMemo(() => {
    const parents = new Map<string, string | null>()
    if (!currentDoc) return parents

    const visit = (nodeId: string, parentId: string | null) => {
      parents.set(nodeId, parentId)
      const node = findNodeById(currentDoc.root, nodeId)
      node?.children.forEach((child) => visit(child.id, nodeId))
    }

    visit(currentDoc.root.id, null)
    return parents
  }, [currentDoc])

  const childIndexByNodeId = React.useMemo(() => {
    const indexes = new Map<string, number>()
    if (!currentDoc) return indexes

    const visit = (node: typeof currentDoc.root) => {
      node.children.forEach((child, index) => {
        indexes.set(child.id, index)
        visit(child)
      })
    }

    visit(currentDoc.root)
    return indexes
  }, [currentDoc])

  const getNodeDescendantIds = React.useCallback((nodeId: string): Set<string> => {
    const descendantIds = new Set<string>()
    if (!currentDoc) return descendantIds

    const node = findNodeById(currentDoc.root, nodeId)
    const collect = (children: typeof currentDoc.root.children) => {
      children.forEach((child) => {
        descendantIds.add(child.id)
        collect(child.children)
      })
    }

    if (node) collect(node.children)
    return descendantIds
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

  const handleAfterDelete = React.useCallback(() => {
    setEditing(null)
  }, [])

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

    const rawGraph = outlineToGraph(currentDoc.root, collapsedNodeIds)
    const layouted = layoutGraph({
      ...rawGraph,
      nodes: rawGraph.nodes.map((node) => {
        const sourceNode = findNodeById(currentDoc.root, node.id)
        const data: MindMapNodeData = {
          label: sourceNode?.text ?? '',
          childCount: sourceNode?.children.length ?? 0,
          collapsed: Boolean(sourceNode && collapsedNodeIds.has(sourceNode.id)),
          checked: sourceNode?.checked,
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
          selected: node.id === selectedNodeId,
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
    editing?.nodeId,
    finishEditing,
    handleDelete,
    indentNode,
    insertChildAndEdit,
    insertSiblingAndEdit,
    moveNode,
    outdentNode,
    selectedNodeId,
    setEdges,
    setNodes,
    toggleCollapse,
    toggleNodeChecked,
    updateNodeText,
  ])

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
            dropState: preview?.nodeId === node.id ? preview.zone : null,
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
    updateDropPreview(
      dragTarget ? { nodeId: dragTarget.targetNodeId, zone: dragTarget.zone } : null,
      draggedNode,
    )
  }, [mode, nodes, resolveDraggedNodeTarget, updateDropPreview])

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
      })
      if (!resolvedMove) return

      moveNodeToParent(draggedNode.id, resolvedMove.parentNodeId, resolvedMove.targetIndex)
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
    const rawGraph = outlineToGraph(currentDoc.root, collapsedNodeIds)
    const layouted = layoutGraph(rawGraph, { preserveSavedPositions: false })
    const nextLayout = layouted.nodes.reduce<Record<string, { x: number; y: number }>>((layout, node) => {
      layout[node.id] = node.position
      return layout
    }, {})
    commitMindMapLayout(nextLayout)
  }, [collapsedNodeIds, commitMindMapLayout, currentDoc])

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
    selectNode(node.id)
  }

  const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
    startEditing(node.id)
  }

  const handleNodeContextMenu = (event: React.MouseEvent, node: Node) => {
    event.preventDefault()
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
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-amber-900/10 bg-[#FAF8F4]/95 p-1 shadow-fabric">
        <button
          type="button"
          aria-label="布局"
          title="布局"
          onClick={() => setMode('layout')}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
            mode === 'layout' ? 'bg-amber-100 text-amber-900' : 'text-zinc-500 hover:bg-amber-50'
          }`}
        >
          <Move className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="重组"
          title="重组"
          onClick={() => setMode('reorganize')}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
            mode === 'reorganize' ? 'bg-emerald-100 text-emerald-800' : 'text-zinc-500 hover:bg-amber-50'
          }`}
        >
          <GitBranch className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="自动整理"
          title="自动整理"
          onClick={handleAutoLayout}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-amber-50"
        >
          <LayoutDashboard className="h-4 w-4" />
        </button>
      </div>
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
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        className="text-zinc-700"
      >
        <Controls className="!bg-[#FAF8F4] !border-amber-900/10 !shadow-fabric [&>button]:!border-amber-900/5 [&>button]:hover:!bg-[#EFECE3]" />
        <MiniMap
          style={{ background: '#FAF8F4', border: '1px dashed rgba(139, 90, 43, 0.2)', borderRadius: '12px' }}
          nodeColor="#FAF6EC"
          maskColor="rgba(240, 235, 220, 0.4)"
          className="!bottom-4 !right-4"
        />
        <Background color="#FAF8F4" gap={16} size={1} />
      </ReactFlow>

      {contextMenu && contextNode && (
        <MindMapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCollapsed={collapsedNodeIds.has(contextMenu.nodeId)}
          operationState={getNodeOperationState(contextMenu.nodeId)}
          onAction={(action) => runAction(contextMenu.nodeId, action)}
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
