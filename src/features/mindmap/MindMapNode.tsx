import React from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Handle, NodeProps, Position } from 'reactflow'
import { MindMapInlineEditor } from './MindMapInlineEditor'

export interface MindMapNodeData {
  label: string
  childCount: number
  collapsed: boolean
  checked?: boolean
  editing: boolean
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

export const MindMapNode: React.FC<NodeProps<MindMapNodeData>> = ({ id, data, selected, type }) => {
  const isRoot = type === 'input'
  const hasChildren = data.childCount > 0

  return (
    <div
      className={`min-w-[170px] max-w-[240px] rounded-xl border-2 px-3 py-2 text-center shadow-fabric transition-all duration-200 ${
        selected
          ? 'scale-[1.03] border-dashed border-amber-600 bg-[#FCFAF0] ring-4 ring-amber-600/5'
          : 'border-dashed border-amber-900/20 bg-[#FAF6EC] hover:border-amber-900/40 hover:bg-[#FAF5E6]'
      }`}
    >
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#A27B5C', border: 'none', width: 6, height: 6 }}
        />
      )}

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
            <div className="break-words text-xs font-semibold leading-relaxed text-zinc-800">
              {data.label || <span className="font-normal italic text-zinc-400">空白节点</span>}
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
        <div className="mt-1 text-[10px] font-medium text-amber-900/50">{data.childCount} 个子节点</div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#A27B5C', border: 'none', width: 6, height: 6 }}
      />
    </div>
  )
}
