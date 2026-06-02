import React from 'react'
import { FolderOpen } from 'lucide-react'
import type { TaskSummary } from '../../filter/filterUtils'

export type SearchTaskFilter = 'all' | 'unchecked' | 'checked'

interface SearchTasksViewProps {
  tasks: TaskSummary[]
  taskFilter: SearchTaskFilter
  onTaskFilterChange: (filter: SearchTaskFilter) => void
  onToggleTask: (nodeId: string) => void
  onOpenTask: (nodeId: string, checked: boolean) => void
}

export const SearchTasksView: React.FC<SearchTasksViewProps> = ({
  tasks,
  taskFilter,
  onTaskFilterChange,
  onToggleTask,
  onOpenTask,
}) => {
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-white p-0.5">
        {[
          { key: 'all', label: '全部' },
          { key: 'unchecked', label: '未完成' },
          { key: 'checked', label: '已完成' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onTaskFilterChange(item.key as SearchTaskFilter)}
            className={`rounded-[4px] px-2 py-1.5 text-xs font-medium ${
              taskFilter === item.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tasks.map((task) => (
        <div key={task.nodeId} className="rounded-lg border border-zinc-200/70 bg-white p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => onToggleTask(task.nodeId)} className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-[10px] font-bold text-zinc-700 hover:border-zinc-500" title={task.checked ? '标记为未完成' : '标记为已完成'}>
              {task.checked ? '✓' : ''}
            </button>
            <button type="button" onClick={() => onOpenTask(task.nodeId, task.checked)} className="min-w-0 flex-1 text-left focus:outline-none">
              <div className={`truncate text-sm font-medium ${task.checked ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
                {task.text || '未命名任务'}
              </div>
              {task.path.length > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
                  <FolderOpen size={11} />
                  <span className="truncate">{task.path.join(' > ')}</span>
                </div>
              )}
            </button>
          </div>
        </div>
      ))}

      {tasks.length === 0 && (
        <div className="py-10 text-center text-xs font-medium text-zinc-400">当前范围没有任务</div>
      )}
    </>
  )
}
