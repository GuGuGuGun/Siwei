import React from 'react'
import { OutlineNode } from '../../types/document'
import { useDocumentStore } from '../document/documentStore'
import { toast } from '../../components/common/Toast'

interface OutlineNodeItemProps {
  node: OutlineNode
  depth: number
  path: number[]
  parentId: string | null
  isSelected: boolean
  isCollapsed: boolean
  onNavigate: (direction: 'up' | 'down') => void
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
}) => {
  const selectNode = useDocumentStore((s) => s.selectNode)
  const updateNodeText = useDocumentStore((s) => s.updateNodeText)
  const toggleCollapse = useDocumentStore((s) => s.toggleCollapse)
  const indentNode = useDocumentStore((s) => s.indentNode)
  const outdentNode = useDocumentStore((s) => s.outdentNode)
  const moveNode = useDocumentStore((s) => s.moveNode)
  const insertNode = useDocumentStore((s) => s.insertNode)
  const deleteNode = useDocumentStore((s) => s.deleteNode)
  const toggleNodeCheck = useDocumentStore((s) => s.toggleNodeCheck)

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
        toggleNodeCheck(node.id)
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
          toggleNodeCheck(node.id)
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

  return (
    <div
      className={`group relative flex items-center h-9 px-2 rounded-lg transition-all duration-200 border ${
        isSelected
          ? 'bg-[#FCFAF2] border-dashed border-amber-900/30 text-zinc-900 shadow-fabric'
          : 'text-zinc-700 border-transparent hover:bg-[#FAF8F5]/80 hover:text-zinc-900'
      }`}
      onClick={(e) => {
        e.stopPropagation()
        selectNode(node.id)
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
      <div className="flex w-5 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing">
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
            toggleNodeCheck(node.id)
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

      {/* Text Node */}
      <div className="flex-1 min-w-0 pl-1.5">
        {isSelected ? (
          <input
            ref={inputRef}
            type="text"
            value={node.text}
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
