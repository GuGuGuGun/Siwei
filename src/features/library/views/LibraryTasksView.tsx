import React from 'react'
import type { LibraryTaskSummary } from '../../../types/library'
import { EmptyState, LoadMoreButton } from '../components/LibraryShared'
import type { LibraryTaskFilter } from '../libraryStore'

interface LibraryTasksViewProps {
  tasks: LibraryTaskSummary[]
  taskFilter: LibraryTaskFilter
  selectedTag: string | null
  hasMore: boolean
  onFilterChange: (filter: LibraryTaskFilter) => void
  onClearTag: () => void
  onOpen: (task: LibraryTaskSummary) => void
  onToggle: (task: LibraryTaskSummary, checked: boolean) => void
  onLoadMore: () => void
}

export const LibraryTasksView: React.FC<LibraryTasksViewProps> = ({
  tasks,
  taskFilter,
  selectedTag,
  hasMore,
  onFilterChange,
  onClearTag,
  onOpen,
  onToggle,
  onLoadMore,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid w-72 grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-white p-0.5">
          {[
            { key: 'all', label: '全部' },
            { key: 'unchecked', label: '未完成' },
            { key: 'checked', label: '已完成' },
          ].map((item) => (
            <button key={item.key} type="button" onClick={() => onFilterChange(item.key as LibraryTaskFilter)} className={`rounded-[4px] px-2 py-1.5 text-xs font-medium ${taskFilter === item.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>
              {item.label}
            </button>
          ))}
        </div>
        {selectedTag && (
          <button type="button" onClick={onClearTag} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
            #{selectedTag} · 清除
          </button>
        )}
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={`${task.documentPath}-${task.nodeId}`} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => onToggle(task, !task.checked)} className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-xs font-bold text-zinc-700 hover:border-zinc-500" title={task.checked ? '标记为未完成' : '标记为已完成'}>
                {task.checked ? '✓' : ''}
              </button>
              <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
                <div className={`text-sm font-medium ${task.checked ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
                  {task.text || '未命名任务'}
                </div>
                <div className="mt-1 truncate text-xs text-zinc-400">{task.documentTitle}</div>
                {task.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {task.tags.map((tag) => (
                      <span key={tag} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </div>
          </div>
        ))}
        {hasMore && <LoadMoreButton onClick={onLoadMore} />}
        {tasks.length === 0 && <EmptyState text="当前筛选下没有任务" />}
      </div>
    </div>
  )
}
