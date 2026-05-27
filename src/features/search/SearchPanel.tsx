import React from 'react'
import {
  CheckSquare,
  CornerDownRight,
  FolderOpen,
  ListTodo,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'
import { searchDocument } from '../../services/siweiApi'
import { OutlineNode, SearchResult } from '../../types/document'
import { collectTags, collectTasks, findNodePath } from '../filter/filterUtils'
import { toast } from '../../components/common/Toast'

interface SearchPanelProps {
  isOpen: boolean
  onClose: () => void
}

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

  const [activeTab, setActiveTab] = React.useState<'search' | 'tags' | 'tasks'>('search')
  const [taskFilter, setTaskFilter] = React.useState<'all' | 'unchecked' | 'checked'>('all')
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

  // Trigger search on query change
  React.useEffect(() => {
    if (!currentDoc || !filter.query.trim()) {
      setResults([])
      return
    }

    const runSearch = async () => {
      setIsSearching(true)
      try {
        const matches = await searchDocument(currentDoc, filter.query)
        setResults(matches)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }

    const timer = setTimeout(runSearch, 250)
    return () => clearTimeout(timer)
  }, [filter.query, currentDoc])

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

  // Highlighting matching strings using mark tags
  const renderHighlightedText = (text: string, matchIndices: Array<[number, number]>) => {
    if (!matchIndices || matchIndices.length === 0) return <span>{text}</span>

    const parts: React.ReactNode[] = []
    let lastIndex = 0

    // Sort intervals
    const sortedIndices = [...matchIndices].sort((a, b) => a[0] - b[0])

    sortedIndices.forEach(([start, end], idx) => {
      if (start > lastIndex) {
        parts.push(<span key={`text-${idx}`}>{text.substring(lastIndex, start)}</span>)
      }
      parts.push(
        <mark
          key={`match-${idx}`}
          className="bg-amber-100 text-amber-900 font-semibold px-0.5 rounded-[2px]"
        >
          {text.substring(start, end)}
        </mark>
      )
      lastIndex = end
    })

    if (lastIndex < text.length) {
      parts.push(<span key="text-end">{text.substring(lastIndex)}</span>)
    }

    return <>{parts}</>
  }

  const sourceLabel = (source: SearchResult['matchSources'][number]) => {
    if (source === 'note') return '备注命中'
    if (source === 'tag') return '标签命中'
    return '正文命中'
  }

  const hasActiveFilter = Boolean(filter.query.trim() || filter.tag || filter.checked !== 'all')

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[400px] border-l border-zinc-200 bg-white/95 text-zinc-700 shadow-[0_0_40px_rgba(0,0,0,0.05)] backdrop-blur-xl flex flex-col transition-all duration-300 animate-slide-left font-sans">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-200/60 px-5 shrink-0 bg-white/50">
        <div className="flex items-center gap-2.5">
          <Search size={16} className="text-zinc-800 font-bold" strokeWidth={2.5} />
          <span className="font-semibold text-[15px] text-zinc-900 tracking-wide">工作台</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 transition focus:outline-none"
        >
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
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
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

      {/* Shared Filter Area */}
      <div className="p-5 border-b border-zinc-200/60 bg-zinc-50/50">
        <div className="relative shadow-sm rounded-lg">
          <input
            type="text"
            value={filter.query}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-4 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 transition placeholder-zinc-400"
            placeholder="输入关键词进行搜索..."
            autoFocus={activeTab === 'search'}
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm hover:border-zinc-300 transition-colors">
            <CheckSquare size={13} className="text-zinc-400" />
            <select
              value={filter.checked}
              onChange={(event) => setFilterChecked(event.target.value as typeof filter.checked)}
              className="bg-transparent text-[11px] font-medium text-zinc-600 outline-none cursor-pointer"
              title="完成状态筛选"
            >
              <option value="all">全部状态</option>
              <option value="task">全部待办</option>
              <option value="unchecked">未完成</option>
              <option value="checked">已完成</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm hover:border-zinc-300 transition-colors">
            <Tag size={13} className="text-zinc-400" />
            <input
              value={filter.tag ?? ''}
              onChange={(event) => setFilterTag(event.target.value)}
              className="w-20 bg-transparent text-[11px] font-medium text-zinc-600 outline-none placeholder-zinc-400"
              placeholder="标签筛选"
            />
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800 focus:outline-none transition-colors"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#FCFCFB]">
        {activeTab === 'search' && (
          <>
            {isSearching && (
              <div className="text-center text-xs text-zinc-400 py-8 font-medium">正在搜索...</div>
            )}

            {!isSearching && filteredResults.map((result) => (
              <button
                key={result.nodeId}
                onClick={() => handleResultClick(result.nodeId)}
                className="w-full text-left rounded-xl border border-zinc-200/60 bg-white p-3.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:border-zinc-300 transition-all flex flex-col gap-2 focus:outline-none"
              >
                {result.path && result.path.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 overflow-hidden truncate">
                    <FolderOpen size={11} className="shrink-0" />
                    <span>{result.path.join(' > ')}</span>
                  </div>
                )}

                <div className="flex items-start gap-2 text-[13px] text-zinc-800 leading-snug">
                  <CornerDownRight size={14} className="shrink-0 mt-0.5 text-zinc-300" />
                  <div className="break-all font-medium">
                    {renderHighlightedText(result.text, result.matchIndices)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pl-5">
                  {result.matchSources.map((source) => (
                    <span
                      key={source}
                      className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-100 text-zinc-500 border border-zinc-200"
                    >
                      {sourceLabel(source)}
                    </span>
                  ))}
                </div>

                {result.matches
                  .filter((match) => match.source !== 'text')
                  .map((match, index) => (
                    <div
                      key={`${match.source}-${index}`}
                      className="mt-1 ml-5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-600 border border-zinc-100"
                    >
                      <span className="mr-1.5 font-medium text-zinc-400">{sourceLabel(match.source)}:</span>
                      {match.source === 'tag'
                        ? <span className="font-semibold text-zinc-700">#{match.value}</span>
                        : renderHighlightedText(match.value, match.matchIndices)}
                    </div>
                  ))}
              </button>
            ))}

            {!isSearching && filter.query.trim() !== '' && filteredResults.length === 0 && (
              <div className="text-center text-sm font-medium text-zinc-400 py-10">
                未找到匹配节点
              </div>
            )}

            {filter.query.trim() === '' && (
              <div className="text-center text-xs font-medium text-zinc-400 py-10">
                输入关键词在当前文档中进行全文搜索
              </div>
            )}
          </>
        )}

        {activeTab === 'tags' && (
          <>
            {tags.map((item) => (
              <div
                key={item.tag}
                className="rounded-lg border border-zinc-200/70 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterTag(item.tag)}
                    className="flex min-w-0 items-center gap-2 text-left focus:outline-none"
                  >
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                      #{item.tag}
                    </span>
                    <span className="text-[11px] text-zinc-400">{item.count} 个节点</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRenameTag(item.tag)}
                      className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMergeTag(item.tag)}
                      className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      合并
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTagFromDocument(item.tag)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                      title="删除标签"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {tags.length === 0 && (
              <div className="text-center text-xs font-medium text-zinc-400 py-10">
                当前文档没有标签
              </div>
            )}
          </>
        )}

        {activeTab === 'tasks' && (
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
                  onClick={() => setTaskFilter(item.key as typeof taskFilter)}
                  className={`rounded-[4px] px-2 py-1.5 text-xs font-medium ${
                    taskFilter === item.key
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tasks.map((task) => (
              <div
                key={task.nodeId}
                className="rounded-lg border border-zinc-200/70 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleNodeChecked(task.nodeId)}
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-[10px] font-bold text-zinc-700 hover:border-zinc-500"
                    title={task.checked ? '标记为未完成' : '标记为已完成'}
                  >
                    {task.checked ? '✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTaskClick(task.nodeId, task.checked)}
                    className="min-w-0 flex-1 text-left focus:outline-none"
                  >
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
              <div className="text-center text-xs font-medium text-zinc-400 py-10">
                当前范围没有任务
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function findNode(root: OutlineNode, nodeId: string): OutlineNode | null {
  const path = findNodePath(root, nodeId)
  return path?.[path.length - 1] ?? null
}
