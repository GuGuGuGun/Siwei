import React from 'react'
import {
  AlertCircle,
  CheckSquare,
  Database,
  FilePlus2,
  FolderOpen,
  ListTodo,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react'

import { openFileDialog } from '../../services/siweiApi'
import { toast } from '../../components/common/Toast'
import type { LibraryDocumentItem, LibrarySearchResult, LibraryTaskSummary } from '../../types/library'
import { useLibraryStore, type LibraryTaskFilter, type LibraryView } from './libraryStore'

export const LibraryWorkspace: React.FC = () => {
  const activeView = useLibraryStore((s) => s.activeView)
  const docs = useLibraryStore((s) => s.docs)
  const searchQuery = useLibraryStore((s) => s.searchQuery)
  const searchResults = useLibraryStore((s) => s.searchResults)
  const tags = useLibraryStore((s) => s.tags)
  const tasks = useLibraryStore((s) => s.tasks)
  const taskFilter = useLibraryStore((s) => s.taskFilter)
  const selectedTag = useLibraryStore((s) => s.selectedTag)
  const isLoading = useLibraryStore((s) => s.isLoading)
  const error = useLibraryStore((s) => s.error)

  const setActiveView = useLibraryStore((s) => s.setActiveView)
  const loadDocs = useLibraryStore((s) => s.loadDocs)
  const addDoc = useLibraryStore((s) => s.addDoc)
  const removeDoc = useLibraryStore((s) => s.removeDoc)
  const refreshDoc = useLibraryStore((s) => s.refreshDoc)
  const refreshAll = useLibraryStore((s) => s.refreshAll)
  const rebuildIndex = useLibraryStore((s) => s.rebuildIndex)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)
  const searchLibrary = useLibraryStore((s) => s.search)
  const loadTags = useLibraryStore((s) => s.loadTags)
  const loadTasks = useLibraryStore((s) => s.loadTasks)
  const setTaskFilter = useLibraryStore((s) => s.setTaskFilter)
  const setSelectedTag = useLibraryStore((s) => s.setSelectedTag)
  const toggleTask = useLibraryStore((s) => s.toggleTask)
  const openIndexedNode = useLibraryStore((s) => s.openIndexedNode)

  React.useEffect(() => {
    if (!activeView) return
    void loadDocs()
  }, [activeView, loadDocs])

  React.useEffect(() => {
    if (activeView === 'tags') void loadTags()
    if (activeView === 'tasks') void loadTasks()
  }, [activeView, loadTags, loadTasks])

  React.useEffect(() => {
    if (activeView !== 'search') return
    const timer = window.setTimeout(() => {
      void searchLibrary()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [activeView, searchQuery, searchLibrary])

  const currentView = activeView ?? 'docs'

  const handleAddDoc = async () => {
    try {
      const path = await openFileDialog(['siwei.json', 'json'])
      if (!path) return
      await addDoc(path)
      toast.success('已加入文档库')
    } catch (error) {
      toast.error(`加入失败: ${String(error)}`)
    }
  }

  const handleRefreshAll = async () => {
    try {
      await refreshAll()
      toast.success('文档库已刷新')
    } catch (error) {
      toast.error(`刷新失败: ${String(error)}`)
    }
  }

  const handleRebuild = async () => {
    try {
      await rebuildIndex()
      toast.success('索引库已重建')
    } catch (error) {
      toast.error(`重建失败: ${String(error)}`)
    }
  }

  const visibleTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      const statusMatches =
        taskFilter === 'all' ||
        (taskFilter === 'checked' && task.checked) ||
        (taskFilter === 'unchecked' && !task.checked)
      const tagMatches = !selectedTag || task.tags.includes(selectedTag)
      return statusMatches && tagMatches
    })
  }, [selectedTag, taskFilter, tasks])

  return (
    <section className="flex h-full flex-col bg-[#FCFCFB] text-zinc-800">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/70 px-5">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-zinc-700" />
          <span className="text-sm font-semibold">文档库</span>
          {isLoading && <RefreshCw size={13} className="animate-spin text-zinc-400" />}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAddDoc}
            className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
          >
            <FilePlus2 size={14} />
            加入文档
          </button>
          <button
            type="button"
            onClick={handleRefreshAll}
            className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <button
            type="button"
            onClick={handleRebuild}
            className="h-8 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            重建索引
          </button>
        </div>
      </header>

      <div className="border-b border-zinc-200/70 bg-white/50 px-5 py-2">
        <div className="grid w-[520px] grid-cols-4 gap-1 rounded-md border border-zinc-200 bg-white p-0.5 shadow-sm">
          {[
            { key: 'docs', label: '文档', icon: FolderOpen },
            { key: 'search', label: '搜索', icon: Search },
            { key: 'tags', label: '标签', icon: Tag },
            { key: 'tasks', label: '任务', icon: ListTodo },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key as LibraryView)}
                className={`flex items-center justify-center gap-1.5 rounded-[4px] px-2 py-1.5 text-xs font-medium transition ${
                  currentView === item.key
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <Icon size={13} />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle size={14} />
          <span className="truncate">{error}</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-5">
        {currentView === 'docs' && (
          <DocumentList
            docs={docs}
            onOpen={(doc) => void openIndexedNode(doc.path)}
            onRefresh={(doc) => void refreshDoc(doc.path)}
            onRemove={(doc) => {
              void removeDoc(doc.path).then(() => toast.info('已移出文档库'))
            }}
          />
        )}

        {currentView === 'search' && (
          <SearchView
            query={searchQuery}
            results={searchResults}
            onQueryChange={setSearchQuery}
            onOpen={(result) => void openIndexedNode(result.documentPath, result.nodeId)}
          />
        )}

        {currentView === 'tags' && (
          <div className="grid gap-3 lg:grid-cols-2">
            {tags.map((tag) => (
              <button
                key={tag.tag}
                type="button"
                onClick={() => {
                  setSelectedTag(tag.tag)
                  setActiveView('tasks')
                }}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-zinc-300"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                    #{tag.tag}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {tag.documentCount} 个文档 · {tag.nodeCount} 个节点
                  </span>
                </div>
              </button>
            ))}
            {tags.length === 0 && <EmptyState text="文档库中还没有标签" />}
          </div>
        )}

        {currentView === 'tasks' && (
          <TaskView
            tasks={visibleTasks}
            taskFilter={taskFilter}
            selectedTag={selectedTag}
            onFilterChange={setTaskFilter}
            onClearTag={() => setSelectedTag(null)}
            onOpen={(task) => void openIndexedNode(task.documentPath, task.nodeId)}
            onToggle={(task, checked) => {
              void toggleTask(task, checked).catch((error) => {
                toast.error(`写回失败: ${String(error)}`)
              })
            }}
          />
        )}
      </main>
    </section>
  )
}

function DocumentList({
  docs,
  onOpen,
  onRefresh,
  onRemove,
}: {
  docs: LibraryDocumentItem[]
  onOpen: (doc: LibraryDocumentItem) => void
  onRefresh: (doc: LibraryDocumentItem) => void
  onRemove: (doc: LibraryDocumentItem) => void
}) {
  if (docs.length === 0) return <EmptyState text="还没有加入文档库的本地文档" />

  return (
    <div className="space-y-2">
      {docs.map((doc) => (
        <div
          key={doc.documentId}
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <button type="button" onClick={() => onOpen(doc)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900">{doc.title || '未命名文档'}</span>
                <StatusPill status={doc.status} />
              </div>
              <div className="mt-1 truncate text-xs text-zinc-400">{doc.path}</div>
              {doc.errorSummary && <div className="mt-2 text-xs text-rose-600">{doc.errorSummary}</div>}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{doc.nodeCount} 节点</span>
                <span>{doc.taskCount} 任务</span>
                <span>{doc.uncheckedTaskCount} 未完成</span>
                <span>{doc.tags.length} 标签</span>
              </div>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onRefresh(doc)}
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                title="刷新索引"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(doc)}
                className="rounded-md p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                title="移出文档库"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SearchView({
  query,
  results,
  onQueryChange,
  onOpen,
}: {
  query: string
  results: LibrarySearchResult[]
  onQueryChange: (query: string) => void
  onOpen: (result: LibrarySearchResult) => void
}) {
  return (
    <div className="space-y-4">
      <div className="relative max-w-2xl">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-400"
          placeholder="搜索文档标题、节点正文、备注或标签"
        />
      </div>
      <div className="space-y-2">
        {results.map((result) => (
          <button
            key={`${result.documentId}-${result.nodeId ?? 'title'}-${result.matchSources.join('-')}`}
            type="button"
            onClick={() => onOpen(result)}
            className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-zinc-300"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-zinc-500">{result.documentTitle}</span>
              <span className="text-[10px] text-zinc-400">{result.matchSources.map(sourceLabel).join(' · ')}</span>
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-800">{result.text || result.documentTitle}</div>
            {result.path.length > 0 && (
              <div className="mt-1 text-xs text-zinc-400">{result.path.join(' > ')}</div>
            )}
          </button>
        ))}
        {query.trim() && results.length === 0 && <EmptyState text="没有找到匹配结果" />}
        {!query.trim() && <EmptyState text="输入关键词开始跨文档搜索" />}
      </div>
    </div>
  )
}

function TaskView({
  tasks,
  taskFilter,
  selectedTag,
  onFilterChange,
  onClearTag,
  onOpen,
  onToggle,
}: {
  tasks: LibraryTaskSummary[]
  taskFilter: LibraryTaskFilter
  selectedTag: string | null
  onFilterChange: (filter: LibraryTaskFilter) => void
  onClearTag: () => void
  onOpen: (task: LibraryTaskSummary) => void
  onToggle: (task: LibraryTaskSummary, checked: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid w-72 grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-white p-0.5">
          {[
            { key: 'all', label: '全部' },
            { key: 'unchecked', label: '未完成' },
            { key: 'checked', label: '已完成' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key as LibraryTaskFilter)}
              className={`rounded-[4px] px-2 py-1.5 text-xs font-medium ${
                taskFilter === item.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {selectedTag && (
          <button
            type="button"
            onClick={onClearTag}
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            #{selectedTag} · 清除
          </button>
        )}
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={`${task.documentPath}-${task.nodeId}`} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onToggle(task, !task.checked)}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-xs font-bold text-zinc-700 hover:border-zinc-500"
                title={task.checked ? '标记为未完成' : '标记为已完成'}
              >
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
        {tasks.length === 0 && <EmptyState text="当前筛选下没有任务" />}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: LibraryDocumentItem['status'] }) {
  const label = {
    ready: '正常',
    missing: '缺失',
    invalid: '损坏',
    stale: '需刷新',
  }[status]
  const className = {
    ready: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    missing: 'bg-rose-50 text-rose-700 border-rose-100',
    invalid: 'bg-amber-50 text-amber-700 border-amber-100',
    stale: 'bg-sky-50 text-sky-700 border-sky-100',
  }[status]
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white/60 text-sm text-zinc-400">
      {text}
    </div>
  )
}

function sourceLabel(source: LibrarySearchResult['matchSources'][number]) {
  if (source === 'title') return '标题'
  if (source === 'note') return '备注'
  if (source === 'tag') return '标签'
  return '正文'
}
