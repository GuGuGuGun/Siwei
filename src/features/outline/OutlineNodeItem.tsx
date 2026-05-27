import React from 'react'
import { OutlineNode } from '../../types/document'
import { useDocumentStore } from '../document/documentStore'
import { toast } from '../../components/common/Toast'
import { NodeNoteEditor } from './NodeNoteEditor'
import { NodeTagEditor } from './NodeTagEditor'

interface OutlineNodeItemProps {
  node: OutlineNode
  depth: number
  path: number[]
  parentId: string | null
  isSelected: boolean
  isCollapsed: boolean
  onNavigate: (direction: 'up' | 'down') => void
  onNodeContextMenu?: (event: React.MouseEvent, nodeId: string) => void
}

// 4-hole Bone Button Fold Toggle
const ButtonToggle: React.FC<{ isCollapsed: boolean; onClick: () => void }> = ({
  isCollapsed,
  onClick,
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="relative flex h-4 w-4 items-center justify-center rounded-full border border-amber-900/25 bg-[#FAF6EC] shadow-sm hover:scale-105 active:scale-95 transition-all focus:outline-none"
      title={isCollapsed ? '展开' : '折叠'}
    >
      {/* 4 Tiny Holes */}
      <span className="absolute inset-0 flex items-center justify-center gap-1.5 flex-wrap p-0.5 opacity-40">
        <span className="w-0.5 h-0.5 rounded-full bg-amber-950" />
        <span className="w-0.5 h-0.5 rounded-full bg-amber-950" />
        <span className="w-0.5 h-0.5 rounded-full bg-amber-950" />
        <span className="w-0.5 h-0.5 rounded-full bg-amber-950" />
      </span>
      {/* Intersecting thread stitches (rotates depending on collapse) */}
      <span
        className={`absolute w-2 h-[1px] bg-amber-850/80 transition-transform duration-200 ${
          isCollapsed ? 'rotate-45' : '-rotate-45'
        }`}
      />
      <span
        className={`absolute w-2 h-[1px] bg-amber-850/80 transition-transform duration-200 ${
          isCollapsed ? '-rotate-45' : 'rotate-45'
        }`}
      />
    </button>
  )
}

// 6-dot Knit Grip Handle
const KnitGrip: React.FC = () => {
  return (
    <div className="grid grid-cols-2 gap-[2px] p-0.5 opacity-30 group-hover:opacity-60 transition-opacity">
      <div className="w-0.5 h-0.5 rounded-full bg-amber-900" />
      <div className="w-0.5 h-0.5 rounded-full bg-amber-900" />
      <div className="w-0.5 h-0.5 rounded-full bg-amber-900" />
      <div className="w-0.5 h-0.5 rounded-full bg-amber-900" />
      <div className="w-0.5 h-0.5 rounded-full bg-amber-900" />
      <div className="w-0.5 h-0.5 rounded-full bg-amber-900" />
    </div>
  )
}

export const OutlineNodeItem: React.FC<OutlineNodeItemProps> = ({
  node,
  depth,
  isSelected,
  isCollapsed,
  onNavigate,
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
  
  // Slash command menu states
  const [showSlashMenu, setShowSlashMenu] = React.useState(false)
  const [slashMenuIndex, setSlashMenuIndex] = React.useState(0)

  const slashCommands = [
    { key: 'todo', label: '待办列表', desc: '添加或切换待办选项', shortcut: 'Ctrl+Enter' },
    { key: 'indent', label: '向内缩进', desc: '将节点向右缩进一级', shortcut: 'Tab' },
    { key: 'outdent', label: '向外缩进', desc: '将节点向左提升一级', shortcut: 'Shift+Tab' },
    { key: 'delete', label: '删除节点', desc: '完全移除此节点', shortcut: 'Backspace' },
  ]

  // Focus caret restoration
  React.useEffect(() => {
    if (isSelected && inputRef.current) {
      inputRef.current.focus()
      const val = inputRef.current.value
      inputRef.current.setSelectionRange(val.length, val.length)
    } else {
      setShowSlashMenu(false)
    }
  }, [isSelected])

  React.useEffect(() => {
    if (!isFocusedNode) return
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isFocusedNode])

  const executeSlashCommand = (key: string) => {
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

    setShowSlashMenu(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return

    // If slash menu is visible, intercept menu controls
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashMenuIndex((prev) => (prev + 1) % slashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashMenuIndex((prev) => (prev - 1 + slashCommands.length) % slashCommands.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        executeSlashCommand(slashCommands[slashMenuIndex].key)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSlashMenu(false)
        return
      }
    }

    switch (e.key) {
      case 'Enter': {
        e.preventDefault()
        const target = e.currentTarget
        const selectionStart = target.selectionStart ?? 0
        const text = target.value

        const beforeText = text.substring(0, selectionStart)
        const afterText = text.substring(selectionStart)

        updateNodeText(node.id, beforeText)
        insertNode(node.id, afterText)
        break
      }
      case 'Backspace': {
        const target = e.currentTarget
        const selectionStart = target.selectionStart ?? 0
        const text = target.value

        if (text === '') {
          e.preventDefault()
          deleteNode(node.id)
        } else if (selectionStart === 0) {
          e.preventDefault()
          outdentNode(node.id)
        }
        break
      }
      case 'Tab': {
        e.preventDefault()
        if (e.shiftKey) {
          outdentNode(node.id)
        } else {
          indentNode(node.id)
        }
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          moveNode(node.id, 'up')
        } else {
          onNavigate('up')
        }
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          moveNode(node.id, 'down')
        } else {
          onNavigate('down')
        }
        break
      }
      case 'Escape': {
        e.preventDefault()
        selectNode(null)
        break
      }
      default:
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          toggleNodeChecked(node.id)
        }
        break
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    updateNodeText(node.id, text)
    
    // Check if ends with '/' to open command menu
    if (text.endsWith('/')) {
      setShowSlashMenu(true)
      setSlashMenuIndex(0)
    } else if (showSlashMenu && !text.includes('/')) {
      setShowSlashMenu(false)
    }
  }

  const hasChildren = node.children && node.children.length > 0

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-siwei-node-id', node.id)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const draggedNodeId = e.dataTransfer.types.includes('application/x-siwei-node-id')
    if (!draggedNodeId) return

    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const sourceNodeId = e.dataTransfer.getData('application/x-siwei-node-id')
    if (!sourceNodeId || sourceNodeId === node.id) return

    moveNodeToSibling(sourceNodeId, node.id)
  }

  return (
    <div
      ref={containerRef}
      data-node-id={node.id}
      className={`group relative flex items-center h-9 px-2 rounded-lg transition-all duration-200 border ${
        isSelected
          ? 'bg-[#FCFAF2] border-dashed border-amber-900/30 text-zinc-900 shadow-fabric'
          : isFocusedNode
            ? 'bg-amber-50 border-amber-300/70 text-zinc-900 shadow-fabric'
          : 'text-zinc-700 border-transparent hover:bg-[#FAF8F5]/80 hover:text-zinc-900'
      }`}
      onClick={(e) => {
        e.stopPropagation()
        selectNode(node.id)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onNodeContextMenu?.(event, node.id)
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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
        draggable
        onDragStart={handleDragStart}
        className="flex h-full w-5 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing"
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
        {isSelected ? (
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
          <div
            className={`text-sm select-none leading-relaxed truncate font-medium ${
              node.checked ? 'text-zinc-400 line-through' : 'text-zinc-800'
            }`}
          >
            {node.text || <span className="text-zinc-400 italic font-normal">空白织线</span>}
          </div>
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
        <div className="absolute left-16 top-9 z-50 w-60 rounded-xl bg-washed-paper p-1.5 animate-scale-up font-sans text-xs">
          <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-dashed border-amber-900/10 mb-1">
            织物指令
          </div>
          <div className="space-y-0.5">
            {slashCommands.map((cmd, i) => (
              <button
                key={cmd.key}
                onClick={(e) => {
                  e.stopPropagation()
                  executeSlashCommand(cmd.key)
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors focus:outline-none ${
                  i === slashMenuIndex
                    ? 'bg-[#EFECE3] text-amber-950 font-semibold'
                    : 'text-zinc-600 hover:bg-[#FAF8F5]'
                }`}
              >
                <div>
                  <div>{cmd.label}</div>
                  <div className="text-[10px] text-zinc-400 font-normal mt-0.5">
                    {cmd.desc}
                  </div>
                </div>
                <kbd className="font-mono text-[9px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                  {cmd.shortcut}
                </kbd>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
