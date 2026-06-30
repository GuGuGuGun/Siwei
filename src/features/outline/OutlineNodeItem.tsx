import React from 'react'
import { OutlineNode } from '../../types/document'
import { useDocumentStore } from '../document/documentStore'
import { toast } from '../../components/common/Toast'
import { NodeNoteEditor } from './NodeNoteEditor'
import { NodeTagEditor } from './NodeTagEditor'
import { AgentInsertionPreviewRows } from './components/AgentInsertionPreviewRows'
import { ButtonToggle, KnitGrip } from './components/OutlineNodeControls'
import { OutlineNodeTextContent } from './components/OutlineNodeTextContent'
import { SlashCommandMenu } from './components/SlashCommandMenu'
import { useNodeDragDrop } from './hooks/useNodeDragDrop'
import { useNodeKeyboardHandling } from './hooks/useNodeKeyboardHandling'
import { useSlashCommandMenu } from './hooks/useSlashCommandMenu'
import type { AgentInsertionPreview, AgentNodePreview } from '../agent/agentTypes'

interface OutlineNodeItemProps {
  node: OutlineNode
  depth: number
  path: number[]
  parentId: string | null
  isSelected: boolean
  isMultiSelected?: boolean
  isCollapsed: boolean
  agentPreview?: AgentNodePreview
  agentInsertions?: AgentInsertionPreview[]
  onNavigate: (direction: 'up' | 'down') => void
  onNodeClick?: (event: React.MouseEvent, nodeId: string) => void
  onBatchMove?: (direction: 'up' | 'down') => boolean
  onBatchIndent?: () => boolean
  onBatchOutdent?: () => boolean
  onNodeContextMenu?: (event: React.MouseEvent, nodeId: string) => void
}

export const OutlineNodeItem: React.FC<OutlineNodeItemProps> = ({
  node,
  depth,
  path,
  parentId,
  isSelected,
  isMultiSelected = false,
  isCollapsed,
  agentPreview,
  agentInsertions = [],
  onNavigate,
  onNodeClick,
  onBatchMove,
  onBatchIndent,
  onBatchOutdent,
  onNodeContextMenu,
}) => {
  const selectNode = useDocumentStore((s) => s.selectNode)
  const updateNodeText = useDocumentStore((s) => s.updateNodeText)
  const toggleCollapse = useDocumentStore((s) => s.toggleCollapse)
  const indentNode = useDocumentStore((s) => s.indentNode)
  const outdentNode = useDocumentStore((s) => s.outdentNode)
  const moveNode = useDocumentStore((s) => s.moveNode)
  const moveNodeToSibling = useDocumentStore((s) => s.moveNodeToSibling)
  const insertNode = useDocumentStore((s) => s.insertNode)
  const deleteNode = useDocumentStore((s) => s.deleteNode)
  const toggleNodeChecked = useDocumentStore((s) => s.toggleNodeChecked)
  const setNodeChecked = useDocumentStore((s) => s.setNodeChecked)
  const beginTextEditSession = useDocumentStore((s) => s.beginTextEditSession)
  const commitTextEditSession = useDocumentStore((s) => s.commitTextEditSession)
  const isFocusedNode = useDocumentStore((s) => s.focusedNodeId === node.id)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isComposing, setIsComposing] = React.useState(false)
  const slashMenu = useSlashCommandMenu()
  const {
    activeCommand,
    activeIndex,
    close: closeSlashMenu,
    commands: slashCommands,
    isOpen: showSlashMenu,
    moveNext: moveSlashMenuNext,
    movePrevious: moveSlashMenuPrevious,
    open: openSlashMenu,
  } = slashMenu
  const hasChildren = node.children && node.children.length > 0

  // Focus caret restoration
  React.useEffect(() => {
    if (isSelected && inputRef.current) {
      inputRef.current.focus()
      const val = inputRef.current.value
      inputRef.current.setSelectionRange(val.length, val.length)
    } else {
      closeSlashMenu()
    }
  }, [closeSlashMenu, isSelected])

  React.useEffect(() => {
    if (!isFocusedNode) return
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isFocusedNode])

  const executeSlashCommand = React.useCallback((key: string) => {
    // 1. Remove the '/' from text if present
    if (inputRef.current) {
      const val = inputRef.current.value
      if (val.endsWith('/')) {
        updateNodeText(node.id, val.substring(0, val.length - 1))
      }
    }

    // 2. Run action
    switch (key) {
      case 'todo':
        toggleNodeChecked(node.id)
        toast.info('已应用待办属性')
        break
      case 'indent':
        indentNode(node.id)
        break
      case 'outdent':
        outdentNode(node.id)
        break
      case 'delete':
        deleteNode(node.id)
        toast.info('已删除大纲节点')
        break
    }

    closeSlashMenu()
  }, [closeSlashMenu, deleteNode, indentNode, node.id, outdentNode, toggleNodeChecked, updateNodeText])

  const handleKeyDown = useNodeKeyboardHandling({
    nodeId: node.id,
    hasChildren,
    isCollapsed,
    isComposing,
    isSlashMenuOpen: showSlashMenu,
    activeSlashCommand: activeCommand,
    onSlashMenuNext: moveSlashMenuNext,
    onSlashMenuPrevious: moveSlashMenuPrevious,
    onSlashMenuClose: closeSlashMenu,
    onSlashCommand: executeSlashCommand,
    onSelectNone: () => selectNode(null),
    onUpdateText: updateNodeText,
    onInsertNode: insertNode,
    onDeleteNode: deleteNode,
    onIndentNode: indentNode,
    onOutdentNode: outdentNode,
    onMoveNode: moveNode,
    onToggleCollapse: toggleCollapse,
    onToggleChecked: toggleNodeChecked,
    onNavigate,
    onBatchMove,
    onBatchIndent,
    onBatchOutdent,
  })

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    updateNodeText(node.id, text)
    
    // Check if ends with '/' to open command menu
    if (text.endsWith('/')) {
      openSlashMenu()
    } else if (showSlashMenu && !text.includes('/')) {
      closeSlashMenu()
    }
  }

  const isAgentDeleting = agentPreview?.kind === 'delete'
  const isAgentMoving = agentPreview?.kind === 'move'
  const agentTextPreview = agentPreview?.kind === 'update' ? agentPreview.text : undefined

  const siblingIndex = path[path.length - 1] ?? 0
  const { handlePointerDown, isDragging, isDropTarget, dragOffset, previewShiftY } = useNodeDragDrop({
    nodeId: node.id,
    parentId,
    siblingIndex,
    onMoveToSibling: moveNodeToSibling,
  })

  return (
    <>
    <div
      ref={containerRef}
      data-node-id={node.id}
      data-node-parent-id={parentId ?? ''}
      data-node-sibling-index={siblingIndex}
      data-drag-state={isDragging ? 'source' : undefined}
      data-drop-target={isDropTarget ? 'true' : undefined}
      style={
        isDragging
          ? { transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.015)` }
          : previewShiftY !== 0
            ? { transform: `translate3d(0, ${previewShiftY}px, 0)` }
            : undefined
      }
      className={`group relative flex items-center h-9 px-2 rounded-lg transition-all duration-200 border ${
        isAgentDeleting
          ? 'bg-rose-50/80 border-rose-200 text-rose-800'
          : agentTextPreview
            ? 'bg-emerald-50/80 border-emerald-200 text-zinc-900 ring-1 ring-emerald-200/70'
          : isAgentMoving
            ? 'bg-sky-50/80 border-sky-200 text-zinc-900 ring-1 ring-sky-200/70'
          : isSelected || isMultiSelected
          ? 'bg-[#FCFAF2] border-dashed border-amber-900/30 text-zinc-900 shadow-fabric'
          : isFocusedNode
            ? 'bg-amber-50 border-amber-300/70 text-zinc-900 shadow-fabric'
          : 'text-zinc-700 border-transparent hover:bg-[#FAF8F5]/80 hover:text-zinc-900'
      } ${
        isDragging
          ? 'pointer-events-none z-10 transform-gpu will-change-transform opacity-75 shadow-lg ring-1 ring-amber-900/20 duration-75 ease-out'
          : ''
      } ${
        isDropTarget
          ? 'border-amber-400/80 bg-amber-50/80 shadow-fabric ring-1 ring-amber-300/40'
          : ''
      } ${
        previewShiftY !== 0 ? 'transform-gpu will-change-transform duration-200 ease-out' : ''
      }`}
      onClick={(e) => {
        e.stopPropagation()
        if (onNodeClick) {
          onNodeClick(e, node.id)
        } else {
          selectNode(node.id)
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onNodeContextMenu?.(event, node.id)
      }}
    >
      {/* Stitch Indent Guide Lines */}
      {Array.from({ length: depth }).map((_, i) => (
        <div
          key={i}
          className="flex h-full w-6 shrink-0 justify-center border-r border-dashed border-amber-900/10"
        />
      ))}

      {/* Knit Grip Handle */}
      <div
        onPointerDown={handlePointerDown}
        className={`flex h-full w-5 shrink-0 items-center justify-center transition-transform cursor-grab active:cursor-grabbing ${
          isDragging ? 'scale-110 cursor-grabbing' : ''
        }`}
        title="拖动排序"
      >
        <KnitGrip />
      </div>

      {/* Button Fold Toggle */}
      <div className="flex w-6 shrink-0 items-center justify-center">
        {hasChildren ? (
          <ButtonToggle
            isCollapsed={!!isCollapsed}
            onClick={() => toggleCollapse(node.id)}
          />
        ) : (
          <div className="h-1 w-1 rounded-full bg-amber-900/25" />
        )}
      </div>

      {/* Stitched Fabric Checkbox */}
      {node.checked !== undefined && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleNodeChecked(node.id)
          }}
          className="flex w-6 shrink-0 items-center justify-center mr-1 focus:outline-none"
        >
          {node.checked ? (
            <div className="w-3.5 h-3.5 rounded border border-dashed border-amber-900/50 bg-[#E3DAC9] flex items-center justify-center">
              {/* Custom stitched cross mark */}
              <div className="w-1.5 h-1.5 rounded-full bg-amber-950/80" />
            </div>
          ) : (
            <div className="w-3.5 h-3.5 rounded border border-dashed border-amber-900/30 bg-[#FDFCFA] hover:border-amber-900/60 transition-colors" />
          )}
        </button>
      )}

      {node.checked === undefined && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setNodeChecked(node.id, false)
          }}
          className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-0 transition hover:bg-[#EFECE3] hover:text-zinc-700 focus:outline-none group-hover:opacity-100"
          title="转为待办"
        >
          <div className="h-3.5 w-3.5 rounded border border-dashed border-amber-900/25" />
        </button>
      )}

      {/* Text Node */}
      <div className="flex-1 min-w-0 pl-1.5">
        {isSelected && !agentTextPreview ? (
          <input
            ref={inputRef}
            type="text"
            value={node.text}
            onFocus={() => beginTextEditSession(node.id)}
            onBlur={() => commitTextEditSession(node.id)}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            className="w-full bg-transparent text-sm font-medium text-zinc-900 outline-none border-none p-0 focus:ring-0 placeholder-zinc-400"
            placeholder="输入编织内容..."
          />
        ) : (
          <OutlineNodeTextContent
            text={node.text}
            checked={node.checked}
            isAgentDeleting={isAgentDeleting}
            isAgentMoving={isAgentMoving}
            agentTextPreview={agentTextPreview}
          />
        )}
      </div>

      <div
        data-node-actions
        className="ml-2 flex max-w-[40%] shrink-0 items-center gap-1 overflow-visible"
      >
        <div className="min-w-0 overflow-hidden">
          <NodeTagEditor nodeId={node.id} tags={node.tags} />
        </div>
        <NodeNoteEditor nodeId={node.id} note={node.note} />
        {node.checked !== undefined && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setNodeChecked(node.id, undefined)
            }}
            className="hidden h-6 rounded-md px-1.5 text-[10px] text-zinc-400 hover:bg-[#EFECE3] hover:text-zinc-700 focus:outline-none group-hover:block"
            title="移除待办状态"
          >
            普通
          </button>
        )}
      </div>

      {/* Slash Commands Dropdown washed-paper Menu */}
      {showSlashMenu && isSelected && (
        <SlashCommandMenu
          commands={slashCommands}
          activeIndex={activeIndex}
          onCommand={executeSlashCommand}
        />
      )}
    </div>
    <AgentInsertionPreviewRows
      depth={depth}
      parentNodeId={node.id}
      insertions={agentInsertions}
    />
    </>
  )
}
