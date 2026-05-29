import React from 'react'
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  Edit3,
  Focus,
  ListPlus,
  MoveDown,
  MoveUp,
  Plus,
  Trash2,
} from 'lucide-react'
import { NodeOperationState } from './documentStore'

export type NodeMenuAction =
  | 'insertSibling'
  | 'insertChild'
  | 'rename'
  | 'delete'
  | 'toggleCollapse'
  | 'toggleChecked'
  | 'moveUp'
  | 'moveDown'
  | 'indent'
  | 'outdent'

export interface NodeMenuItem {
  key: string
  label: string
  disabled: boolean
  danger?: boolean
}

interface NodeContextMenuProps {
  x: number
  y: number
  isCollapsed: boolean
  operationState: NodeOperationState
  onAction: (action: NodeMenuAction) => void
  onFocusBranch?: () => void
}

const actionIcons: Record<NodeMenuAction, React.ReactNode> = {
  insertSibling: <ListPlus className="h-3.5 w-3.5" />,
  insertChild: <Plus className="h-3.5 w-3.5" />,
  rename: <Edit3 className="h-3.5 w-3.5" />,
  delete: <Trash2 className="h-3.5 w-3.5" />,
  toggleCollapse: <ChevronRight className="h-3.5 w-3.5" />,
  toggleChecked: <CheckSquare className="h-3.5 w-3.5" />,
  moveUp: <MoveUp className="h-3.5 w-3.5" />,
  moveDown: <MoveDown className="h-3.5 w-3.5" />,
  indent: <CornerDownRight className="h-3.5 w-3.5" />,
  outdent: <CornerUpLeft className="h-3.5 w-3.5" />,
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  x,
  y,
  isCollapsed,
  operationState,
  onAction,
  onFocusBranch,
}) => {
  const items: Array<{ action: NodeMenuAction; label: string; disabled: boolean; danger?: boolean }> = [
    { action: 'insertSibling', label: '新增同级节点', disabled: !operationState.canInsertSibling },
    { action: 'insertChild', label: '新增子节点', disabled: !operationState.canInsertChild },
    { action: 'rename', label: '重命名', disabled: false },
    { action: 'delete', label: '删除节点', disabled: !operationState.canDelete, danger: true },
    {
      action: 'toggleCollapse',
      label: isCollapsed ? '展开' : '折叠',
      disabled: !operationState.canToggleCollapse,
    },
    { action: 'toggleChecked', label: '标记/取消待办', disabled: false },
    { action: 'moveUp', label: '上移', disabled: !operationState.canMoveUp },
    { action: 'moveDown', label: '下移', disabled: !operationState.canMoveDown },
    { action: 'indent', label: '向内缩进', disabled: !operationState.canIndent },
    { action: 'outdent', label: '向外缩进', disabled: !operationState.canOutdent },
  ]

  const menuStyle = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 360),
  }

  return (
    <div
      role="menu"
      className="fixed z-40 w-52 rounded-lg border border-amber-900/15 bg-[#FFFCF5] p-1.5 text-xs shadow-[0_16px_40px_rgba(75,55,35,0.18)]"
      style={menuStyle}
      onClick={(event) => event.stopPropagation()}
    >
      {items.map((item) => {
        const icon = item.action === 'toggleCollapse' && isCollapsed
          ? <ChevronDown className="h-3.5 w-3.5" />
          : actionIcons[item.action]

        return (
          <button
            key={item.action}
            role="menuitem"
            disabled={item.disabled}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${
              item.danger
                ? 'text-rose-700 enabled:hover:bg-rose-50'
                : 'text-zinc-700 enabled:hover:bg-amber-100/60'
            } disabled:cursor-not-allowed disabled:text-zinc-300`}
            onClick={() => onAction(item.action)}
          >
            {icon}
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
      {onFocusBranch && (
        <button
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-zinc-700 transition hover:bg-amber-100/60"
          onClick={onFocusBranch}
        >
          <Focus className="h-3.5 w-3.5" />
          <span className="truncate">聚焦此分支</span>
        </button>
      )}
    </div>
  )
}
