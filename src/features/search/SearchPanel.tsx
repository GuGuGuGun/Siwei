import React from 'react'
import {
  CheckSquare,
  ListTodo,
  Search,
  Tag,
  X,
} from 'lucide-react'
import { toast } from '../../components/common/Toast'
import { searchDocument } from '../../services/siweiApi'
import type { OutlineNode, SearchResult } from '../../types/document'
import { collectTags, collectTasks, findNodePath } from '../filter/filterUtils'
import { useDocumentStore } from '../document/documentStore'
import { SearchResultsView } from './views/SearchResultsView'
import { SearchTagsView } from './views/SearchTagsView'
import { SearchTasksView, type SearchTaskFilter } from './views/SearchTasksView'

interface SearchPanelProps {
  isOpen: boolean
  onClose: () => void
}

type SearchPanelTab = 'search' | 'tags' | 'tasks'

export const SearchPanel: React.FC<SearchPanelProps> = ({ isOpen, onClose }) => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const filter = useDocumentStore((s) => s.filter)
  const setFilterQuery = useDocumentStore((s) => s.setFilterQuery)
  const setFilterTag = useDocumentStore((s) => s.setFilterTag)
  const setFilterChecked = useDocumentStore((s) => s.setFilterChecked)
  const clearFilters = useDocumentStore((s) => s.clearFilters)
  const focusNode = useDocumentStore((s) => s.focusNode)
  const renameTag = useDocumentStore((s) => s.renameTag)
  const removeTagFromDocument = useDocumentStore((s) => s.removeTagFromDocument)
  const mergeTag = useDocumentStore((s) => s.mergeTag)
  const toggleNodeChecked = useDocumentStore((s) => s.toggleNodeChecked)

  const [activeTab, setActiveTab] = React.useState<SearchPanelTab>('search')
  const [taskFilter, setTaskFilter] = React.useState<SearchTaskFilter>('all')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = React.useState(false)

  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  React.useEffect(() => {
    if (!currentDoc || !filter.query.trim()) {
      setResults([])
      return
    }

    const runSearch = async () => {
      setIsSearching(true)
      try {
        setResults(await searchDocument(currentDoc, filter.query))
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setIsSearching(false)
      }
    }

    const timer = window.setTimeout(runSearch, 250)
    return () => window.clearTimeout(timer)
  }, [currentDoc, filter.query])

  const tags = React.useMemo(() => {
    if (!currentDoc) return []
    return collectTags(currentDoc.root)
  }, [currentDoc])

  const tasks = React.useMemo(() => {
    if (!currentDoc) return []
    return collectTasks(currentDoc.root).filter((task) => {
      if (taskFilter === 'checked') return task.checked
      if (taskFilter === 'unchecked') return !task.checked
      return true
    })
  }, [currentDoc, taskFilter])

  const filteredResults = React.useMemo(() => {
    if (!currentDoc) return []

    return results.filter((result) => {
      const node = findNode(currentDoc.root, result.nodeId)
      if (!node) return false

      const tagMatches = !filter.tag || (node.tags ?? []).includes(filter.tag)
      const checkedMatches =
        filter.checked === 'all' ||
        (filter.checked === 'checked' && node.checked === true) ||
        (filter.checked === 'unchecked' && node.checked === false) ||
        (filter.checked === 'task' && node.checked !== undefined)

      return tagMatches && checkedMatches
    })
  }, [currentDoc, filter, results])

  const hasActiveFilter = Boolean(filter.query.trim() || filter.tag || filter.checked !== 'all')

  const handleResultClick = (nodeId: string) => {
    focusNode(nodeId)
    onClose()
    toast.info('已定位到搜索节点')
  }

  const handleTaskClick = (nodeId: string, checked: boolean) => {
    if (
      (filter.checked === 'checked' && !checked) ||
      (filter.checked === 'unchecked' && checked) ||
      filter.checked === 'all'
    ) {
      setFilterChecked('task')
    }
    focusNode(nodeId)
    onClose()
    toast.info('已定位到任务节点')
  }

  const handleRenameTag = (tag: string) => {
    const next = window.prompt('输入新的标签名称', tag)
    if (next === null) return
    renameTag(tag, next)
  }

  const handleMergeTag = (tag: string) => {
    const next = window.prompt('输入要合并到的标签名称', filter.tag ?? '')
    if (next === null) return
    mergeTag(tag, next)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[400px] flex-col border-l border-zinc-200 bg-white/95 font-sans text-zinc-700 shadow-[0_0_40px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-all duration-300 animate-slide-left">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200/60 bg-white/50 px-5">
        <div className="flex items-center gap-2.5">
          <Search size={16} className="font-bold text-zinc-800" strokeWidth={2.5} />
          <span className="text-[15px] font-semibold tracking-wide text-zinc-900">工作台</span>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none">
          <X size={16} />
        </button>
      </div>

      <div className="border-b border-zinc-200/60 bg-zinc-50/50 px-5 pt-4">
        <div className="grid grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-white p-0.5 shadow-sm">
          {[
            { key: 'search', label: '搜索', icon: Search },
            { key: 'tags', label: '标签', icon: Tag },
            { key: 'tasks', label: '任务', icon: ListTodo },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as SearchPanelTab)}
                className={`flex items-center justify-center gap-1.5 rounded-[4px] px-2 py-1.5 text-xs font-medium transition ${
                  activeTab === tab.key
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-b border-zinc-200/60 bg-zinc-50/50 p-5">
        <div className="relative rounded-lg shadow-sm">
          <input
            type="text"
            value={filter.query}
            onChange={(event) => setFilterQuery(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-800 outline-none transition placeholder-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20"
            placeholder="输入关键词进行搜索..."
            autoFocus={activeTab === 'search'}
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm transition-colors hover:border-zinc-300">
            <CheckSquare size={13} className="text-zinc-400" />
            <select
              value={filter.checked}
              onChange={(event) => setFilterChecked(event.target.value as typeof filter.checked)}
              className="cursor-pointer bg-transparent text-[11px] font-medium text-zinc-600 outline-none"
              title="完成状态筛选"
            >
              <option value="all">全部状态</option>
              <option value="task">全部待办</option>
              <option value="unchecked">未完成</option>
              <option value="checked">已完成</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm transition-colors hover:border-zinc-300">
            <Tag size={13} className="text-zinc-400" />
            <input
              value={filter.tag ?? ''}
              onChange={(event) => setFilterTag(event.target.value)}
              className="w-20 bg-transparent text-[11px] font-medium text-zinc-600 outline-none placeholder-zinc-400"
              placeholder="标签筛选"
            />
          </div>
          {hasActiveFilter && (
            <button type="button" onClick={clearFilters} className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200/50 hover:text-zinc-800 focus:outline-none">
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#FCFCFB] p-4">
        {activeTab === 'search' && (
          <SearchResultsView
            query={filter.query}
            isSearching={isSearching}
            results={filteredResults}
            onOpenResult={handleResultClick}
          />
        )}
        {activeTab === 'tags' && (
          <SearchTagsView
            tags={tags}
            onSelectTag={setFilterTag}
            onRenameTag={handleRenameTag}
            onMergeTag={handleMergeTag}
            onRemoveTag={removeTagFromDocument}
          />
        )}
        {activeTab === 'tasks' && (
          <SearchTasksView
            tasks={tasks}
            taskFilter={taskFilter}
            onTaskFilterChange={setTaskFilter}
            onToggleTask={toggleNodeChecked}
            onOpenTask={handleTaskClick}
          />
        )}
      </div>
    </div>
  )
}

function findNode(root: OutlineNode, nodeId: string): OutlineNode | null {
  const path = findNodePath(root, nodeId)
  return path?.[path.length - 1] ?? null
}
