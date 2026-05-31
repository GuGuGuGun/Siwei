import React from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Handle, NodeProps, Position } from 'reactflow'
import { MindMapInlineEditor } from './MindMapInlineEditor'
import type { AgentNodePreview } from '../agent/agentTypes'

export interface MindMapNodeData {
  label: string
  depth: number
  childCount: number
  visibleChildCount: number
  collapsed: boolean
  focused: boolean
  matched: boolean
  activeMatch: boolean
  hasTags: boolean
  exportClean?: boolean
  dropState?: 'before' | 'child' | 'after' | null
  invalidDrop?: boolean
  agentPreview?: AgentNodePreview
  agentInsertion?: boolean
  checked?: boolean
  editing: boolean
  leftBranchCollapsed?: boolean
  rightBranchCollapsed?: boolean
  onToggleBranchSide?: (nodeId: string, side: 'left' | 'right') => void
  onToggleCollapse: (nodeId: string) => void
  onTextChange: (nodeId: string, text: string) => void
  onCommitEdit: (nodeId: string) => void
  onCancelEdit: () => void
  onDeleteEmpty: (nodeId: string) => void
  onInsertSibling: (nodeId: string) => void
  onInsertChild: (nodeId: string) => void
  onIndent: (nodeId: string) => void
  onOutdent: (nodeId: string) => void
  onMoveUp: (nodeId: string) => void
  onMoveDown: (nodeId: string) => void
  onToggleChecked: (nodeId: string) => void
}

const handleStyle = { background: '#A27B5C', border: 'none', width: 6, height: 6 }

export const MindMapNode: React.FC<NodeProps<MindMapNodeData>> = ({ id, data, selected, type }) => {
  const isRoot = type === 'root'
  const hasChildren = data.childCount > 0
  const visualDepth = Math.min(data.depth, 3)
  const isAgentDeleting = data.agentPreview?.kind === 'delete'
  const isAgentMoving = data.agentPreview?.kind === 'move'
  const agentTextPreview = data.agentPreview?.kind === 'update' ? data.agentPreview.text : undefined

  const handleBranchSideClick = (event: React.MouseEvent, side: 'left' | 'right') => {
    event.stopPropagation()
    data.onToggleBranchSide?.(id, side)
  }

  return (
    <div
      data-testid={`mindmap-node-${id}`}
      className={`relative min-w-[170px] max-w-[240px] rounded-xl border-2 px-3 py-2 text-center shadow-fabric transition-all duration-200 ${
        isAgentDeleting
          ? 'border-rose-300 bg-rose-50 ring-4 ring-rose-500/10'
        : data.agentInsertion
          ? 'border-emerald-300 bg-emerald-50 ring-4 ring-emerald-500/10'
        : agentTextPreview
          ? 'border-emerald-300 bg-emerald-50 ring-4 ring-emerald-500/10'
        : isAgentMoving
          ? 'border-sky-300 bg-sky-50 ring-4 ring-sky-500/10'
        : data.activeMatch && !data.exportClean
          ? 'scale-[1.03] border-sky-500 bg-sky-50 ring-4 ring-sky-500/15'
        : selected && !data.exportClean
          ? 'scale-[1.03] border-dashed border-amber-600 bg-[#FCFAF0] ring-4 ring-amber-600/5'
        : data.matched && !data.exportClean
          ? 'border-sky-300 bg-sky-50'
        : data.focused
          ? 'border-zinc-500 bg-white ring-4 ring-zinc-500/10'
        : data.invalidDrop
          ? 'border-rose-300 bg-rose-50 ring-4 ring-rose-500/10'
        : data.dropState === 'child'
          ? 'scale-[1.02] border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/10'
          : 'border-dashed border-amber-900/20 bg-[#FAF6EC] hover:border-amber-900/40 hover:bg-[#FAF5E6]'
      }`}
    >
      {data.dropState === 'before' && <div className="absolute -top-2 left-2 right-2 h-0.5 rounded bg-emerald-600" />}
      {data.dropState === 'after' && <div className="absolute -bottom-2 left-2 right-2 h-0.5 rounded bg-emerald-600" />}
      {data.invalidDrop && <div className="absolute -top-2 left-2 right-2 h-0.5 rounded bg-rose-500" />}
      <Handle id="left-target" type="target" position={Position.Left} style={handleStyle} />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        style={handleStyle}
        onClick={(event) => handleBranchSideClick(event, 'left')}
      />
      <Handle id="right-target" type="target" position={Position.Right} style={handleStyle} />
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        style={handleStyle}
        onClick={(event) => handleBranchSideClick(event, 'right')}
      />

      <div className="flex min-h-8 items-center gap-2">
        <button
          type="button"
          aria-label={data.collapsed ? '展开节点' : '折叠节点'}
          disabled={!hasChildren}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-900/70 transition enabled:hover:bg-amber-100 disabled:opacity-20"
          onClick={(event) => {
            event.stopPropagation()
            data.onToggleCollapse(id)
          }}
        >
          {data.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          {data.editing ? (
            <MindMapInlineEditor
              value={data.label}
              onChange={(value) => data.onTextChange(id, value)}
              onCommit={() => data.onCommitEdit(id)}
              onCancel={data.onCancelEdit}
              onDeleteEmpty={() => data.onDeleteEmpty(id)}
              onInsertSibling={() => data.onInsertSibling(id)}
              onInsertChild={() => data.onInsertChild(id)}
              onIndent={() => data.onIndent(id)}
              onOutdent={() => data.onOutdent(id)}
              onMoveUp={() => data.onMoveUp(id)}
              onMoveDown={() => data.onMoveDown(id)}
              onToggleChecked={() => data.onToggleChecked(id)}
            />
          ) : (
            <div>
              <div className={`break-words text-xs leading-relaxed ${
                isAgentDeleting
                  ? 'font-semibold text-rose-700 line-through'
                  : agentTextPreview
                    ? 'font-semibold text-zinc-400 line-through'
                    : visualDepth === 0
                      ? 'text-sm font-bold text-zinc-900'
                      : visualDepth === 1
                        ? 'font-semibold text-zinc-800'
                        : 'font-medium text-zinc-700'
              }`}>
                {data.label || <span className="font-normal italic text-zinc-400">空白节点</span>}
              </div>
              {agentTextPreview && (
                <div className="break-words text-xs font-semibold leading-relaxed text-emerald-700">
                  {agentTextPreview}
                </div>
              )}
              {data.agentInsertion && (
                <div className="mt-0.5 text-[10px] font-medium text-emerald-600">将插入</div>
              )}
              {isAgentDeleting && (
                <div className="mt-0.5 text-[10px] font-medium text-rose-500">将删除</div>
              )}
              {isAgentMoving && (
                <div className="mt-0.5 text-[10px] font-medium text-sky-600">将移动</div>
              )}
              {data.hasTags && !data.exportClean && (
                <div className="mt-1 text-[10px] font-medium text-amber-800/55">含标签</div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="切换待办状态"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
            data.checked !== undefined
              ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700'
              : 'border-amber-900/10 text-amber-900/30 hover:bg-amber-100'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            data.onToggleChecked(id)
          }}
        >
          {data.checked ? <Check className="h-3.5 w-3.5" /> : null}
        </button>
      </div>

      {data.collapsed && hasChildren && (
        <div className="mt-1 text-[10px] font-medium text-amber-900/50">
          {data.childCount} 个子节点
          {data.visibleChildCount !== data.childCount && `，当前显示 ${data.visibleChildCount} 个`}
        </div>
      )}

    </div>
  )
}
