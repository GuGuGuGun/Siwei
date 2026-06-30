import React from 'react'
import { useDocumentStore } from '../document/documentStore'
import { OutlineNodeItem } from './OutlineNodeItem'
import { filterVisibleTree } from '../filter/filterUtils'
import { FileText, Plus } from 'lucide-react'
import { NodeContextMenu } from '../document/NodeContextMenu'
import { NodeDeleteDialog } from '../document/NodeDeleteDialog'
import { useNodeContextMenuController } from '../document/useNodeContextMenuController'
import { formatDeleteConfirmation } from '../document/nodeActions'
import { createAgentDocumentPreview } from '../agent/agentChangePlan'
import { useAgentStore } from '../agent/agentStore'

export const OutlineEditor: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const selectedNodeId = useDocumentStore((s) => s.selectedNodeId)
  const outlineSelection = useDocumentStore((s) => s.outlineSelection)
  const collapsedNodeIds = useDocumentStore((s) => s.collapsedNodeIds)
  const filter = useDocumentStore((s) => s.filter)
  const pendingAgentPlan = useAgentStore((s) => s.pendingPlan)
  
  const selectNode = useDocumentStore((s) => s.selectNode)
  const setOutlineSelection = useDocumentStore((s) => s.setOutlineSelection)
  const updateNodeText = useDocumentStore((s) => s.updateNodeText)
  const insertNode = useDocumentStore((s) => s.insertNode)
  const moveSelectedOutlineNodes = useDocumentStore((s) => s.moveSelectedOutlineNodes)
  const indentSelectedOutlineNodes = useDocumentStore((s) => s.indentSelectedOutlineNodes)
  const outdentSelectedOutlineNodes = useDocumentStore((s) => s.outdentSelectedOutlineNodes)
  const beginTextEditSession = useDocumentStore((s) => s.beginTextEditSession)
  const commitTextEditSession = useDocumentStore((s) => s.commitTextEditSession)
  const getNodeOperationState = useDocumentStore((s) => s.getNodeOperationState)

  const startEditing = React.useCallback((nodeId: string) => {
    selectNode(nodeId)
    beginTextEditSession(nodeId)
  }, [beginTextEditSession, selectNode])

  const {
    contextMenu,
    contextNode,
    deleteTarget,
    closeContextMenu,
    openContextMenu,
    runAction,
    confirmDelete,
    cancelDelete,
  } = useNodeContextMenuController({
    currentDoc,
    onStartEditing: startEditing,
  })

  const visibleNodes = React.useMemo(() => {
    if (!currentDoc) return []
    return filterVisibleTree(currentDoc.root, collapsedNodeIds, filter).nodes
  }, [currentDoc, collapsedNodeIds, filter])

  const agentPreview = React.useMemo(
    () => createAgentDocumentPreview(pendingAgentPlan),
    [pendingAgentPlan],
  )
  const rootAgentInsertions = currentDoc
    ? agentPreview.insertionsByParentId.get(currentDoc.root.id) ?? []
    : []

  const handleNavigate = (nodeId: string, direction: 'up' | 'down') => {
    const index = visibleNodes.findIndex((n) => n.node.id === nodeId)
    if (index === -1) return

    if (direction === 'up' && index > 0) {
      selectNode(visibleNodes[index - 1].node.id)
    } else if (direction === 'down' && index < visibleNodes.length - 1) {
      selectNode(visibleNodes[index + 1].node.id)
    }
  }

  const handleNodeClick = (event: React.MouseEvent, nodeId: string) => {
    if (!event.shiftKey) {
      selectNode(nodeId)
      return
    }

    const anchorNodeId = outlineSelection.anchorNodeId ?? selectedNodeId ?? nodeId
    const anchorIndex = visibleNodes.findIndex((item) => item.node.id === anchorNodeId)
    const focusIndex = visibleNodes.findIndex((item) => item.node.id === nodeId)
    if (anchorIndex === -1 || focusIndex === -1) {
      selectNode(nodeId)
      return
    }

    const [start, end] = anchorIndex < focusIndex ? [anchorIndex, focusIndex] : [focusIndex, anchorIndex]
    setOutlineSelection({
      anchorNodeId,
      selectedNodeIds: visibleNodes.slice(start, end + 1).map((item) => item.node.id),
    })
  }

  const selectedVisibleNodeIds = outlineSelection.selectedNodeIds.filter((nodeId) =>
    visibleNodes.some((item) => item.node.id === nodeId),
  )
  const hasMultiSelection = selectedVisibleNodeIds.length > 1

  const runBatchMove = (direction: 'up' | 'down') => {
    if (!hasMultiSelection) return false
    return moveSelectedOutlineNodes(selectedVisibleNodeIds, direction)
  }

  const runBatchIndent = () => {
    if (!hasMultiSelection) return false
    return indentSelectedOutlineNodes(selectedVisibleNodeIds)
  }

  const runBatchOutdent = () => {
    if (!hasMultiSelection) return false
    return outdentSelectedOutlineNodes(selectedVisibleNodeIds)
  }

  if (!currentDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 bg-linen dark:bg-zinc-950">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900/50 mb-4 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50">
          <FileText size={28} className="text-zinc-400 dark:text-zinc-500" />
        </div>
        <p className="text-sm font-medium tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">未选择任何织物</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[200px] text-center leading-relaxed">从左侧边栏选择、导入或新建一个文件以开始缝合思绪</p>
      </div>
    )
  }

  const handleEmptyClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeContextMenu()
      if (visibleNodes.length > 0) {
        selectNode(visibleNodes[visibleNodes.length - 1].node.id)
      } else {
        insertNode(currentDoc.root.id)
      }
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-linen dark:bg-zinc-950 px-12 py-8 overflow-y-auto select-text cursor-text relative"
      onClick={handleEmptyClick}
    >
      {/* Title Header: Stitched Fabric Tag look */}
      <div className="mb-8 border-b border-dashed border-amber-900/20 dark:border-zinc-800 pb-4 shrink-0">
        <input
          type="text"
          value={currentDoc.title || ''}
          onFocus={() => beginTextEditSession(currentDoc.root.id)}
          onBlur={() => commitTextEditSession(currentDoc.root.id)}
          onChange={(e) => updateNodeText(currentDoc.root.id, e.target.value)}
          className="w-full bg-transparent text-2xl font-bold text-zinc-900 dark:text-zinc-100 outline-none border-none p-0 focus:ring-0 placeholder-zinc-300 dark:placeholder-zinc-700 tracking-wide font-sans"
          placeholder="未命名织物"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {hasMultiSelection && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-900/10 bg-[#FAF8F5] px-2.5 py-1">
            <span>{`已选择 ${selectedVisibleNodeIds.length} 个节点`}</span>
            <button type="button" onClick={() => runBatchMove('up')} className="rounded px-1.5 hover:bg-[#EFECE3]">
              上移
            </button>
            <button type="button" onClick={() => runBatchMove('down')} className="rounded px-1.5 hover:bg-[#EFECE3]">
              下移
            </button>
            <button type="button" onClick={runBatchIndent} className="rounded px-1.5 hover:bg-[#EFECE3]">
              缩进
            </button>
            <button type="button" onClick={runBatchOutdent} className="rounded px-1.5 hover:bg-[#EFECE3]">
              提升
            </button>
          </div>
        )}
      </div>

      {/* Visible Node List */}
      <div className="flex-1 flex flex-col gap-1 pb-40">
        {visibleNodes.map((item) => (
          <OutlineNodeItem
            key={item.node.id}
            node={item.node}
            depth={item.depth}
            path={item.path}
            parentId={item.parentId}
            isSelected={selectedNodeId === item.node.id}
            isMultiSelected={selectedVisibleNodeIds.includes(item.node.id)}
            isCollapsed={Boolean(item.node.collapsed || collapsedNodeIds.has(item.node.id))}
            agentPreview={agentPreview.nodePreviews.get(item.node.id)}
            agentInsertions={agentPreview.insertionsByParentId.get(item.node.id) ?? []}
            onNavigate={(dir) => handleNavigate(item.node.id, dir)}
            onNodeClick={handleNodeClick}
            onBatchMove={runBatchMove}
            onBatchIndent={runBatchIndent}
            onBatchOutdent={runBatchOutdent}
            onNodeContextMenu={(event, nodeId) => openContextMenu(nodeId, event.clientX, event.clientY)}
          />
        ))}

        {visibleNodes.length === 0 && rootAgentInsertions.length > 0 && (
          <div className="my-6 space-y-2">
            {rootAgentInsertions.map((insertion) => (
              <div
                key={insertion.node.id}
                data-agent-insertion-parent-id={currentDoc.root.id}
                className="flex h-10 items-center rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 px-3 text-sm font-medium text-emerald-700"
              >
                <span className="mr-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  将插入
                </span>
                <span className="truncate">{insertion.node.text || '空白节点'}</span>
              </div>
            ))}
          </div>
        )}

        {visibleNodes.length === 0 && rootAgentInsertions.length === 0 && (
          <div
            onClick={() => insertNode(currentDoc.root.id)}
            className="flex flex-col items-center gap-3 border border-dashed border-amber-900/30 dark:border-zinc-800 rounded-2xl p-8 text-zinc-400 dark:text-zinc-500 hover:border-amber-900/50 dark:hover:border-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition cursor-pointer justify-center my-6 select-none bg-[#FAF9F5]/40 dark:bg-zinc-900/20 group shadow-sm"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-900/5 dark:bg-zinc-800/50 group-hover:scale-110 transition-transform duration-300">
              <Plus size={16} />
            </div>
            <span className="text-xs font-medium tracking-wide">点击缝入第一个节点</span>
          </div>
        )}
      </div>

      {contextMenu && contextNode && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCollapsed={Boolean(contextNode.collapsed || collapsedNodeIds.has(contextMenu.nodeId))}
          operationState={getNodeOperationState(contextMenu.nodeId)}
          onAction={(action) => runAction(contextMenu.nodeId, action)}
        />
      )}

      {deleteTarget && (
        <NodeDeleteDialog
          message={formatDeleteConfirmation(deleteTarget)}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
