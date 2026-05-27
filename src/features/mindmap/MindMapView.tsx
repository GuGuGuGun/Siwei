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

import { FileText } from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'
import { useNodeContextMenuController } from '../document/useNodeContextMenuController'
import { outlineToGraph } from './outlineToGraph'
import { layoutGraph } from './layoutGraph'
import { MindMapNode, MindMapNodeData } from './MindMapNode'
import { MindMapContextMenu } from './MindMapContextMenu'
import { MindMapDeleteDialog } from './MindMapDeleteDialog'
import { findNodeById, formatDeleteConfirmation } from './mindMapActions'

interface MindMapEditingState {
  nodeId: string
}

const nodeTypes = {
  custom: MindMapNode,
  root: MindMapNode,
}

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

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [editing, setEditing] = React.useState<MindMapEditingState | null>(null)

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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
