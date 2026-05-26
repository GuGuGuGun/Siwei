import React from 'react'
import { Search, X, FolderOpen, CornerDownRight, CheckSquare, Tag } from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'
import { searchDocument } from '../../services/siweiApi'
import { SearchResult } from '../../types/document'
import { findPath } from '../../utils/tree'
import { toast } from '../../components/common/Toast'

interface SearchPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ isOpen, onClose }) => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const collapsedNodeIds = useDocumentStore((s) => s.collapsedNodeIds)
  const filter = useDocumentStore((s) => s.filter)
  const setFilterTag = useDocumentStore((s) => s.setFilterTag)
  const setFilterChecked = useDocumentStore((s) => s.setFilterChecked)
  const clearFilters = useDocumentStore((s) => s.clearFilters)
  const selectNode = useDocumentStore((s) => s.selectNode)

  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = React.useState(false)

  // Clear query on close
  React.useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setResults([])
    }
  }, [isOpen])

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
    if (!currentDoc || !query.trim()) {
      setResults([])
      return
    }

    const runSearch = async () => {
      setIsSearching(true)
      try {
        const matches = await searchDocument(currentDoc, query)
        setResults(matches)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }

    const timer = setTimeout(runSearch, 250)
    return () => clearTimeout(timer)
  }, [query, currentDoc])

  const filteredResults = React.useMemo(() => {
    if (!currentDoc) return []

    const findNode = (nodeId: string) => {
      const path = findPath(currentDoc.root, nodeId)
      if (!path) return null
      let node = currentDoc.root
      for (const index of path) {
        node = node.children[index]
      }
      return node
    }

    return results.filter((result) => {
      const node = findNode(result.nodeId)
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
    if (!currentDoc) return

    // 1. Find the path to the node to expand all collapsed parents
    const path = findPath(currentDoc.root, nodeId)
    if (path) {
      const newCollapsed = new Set(collapsedNodeIds)
      let curr = currentDoc.root
      
      // Expand parents along the path
      for (const idx of path.slice(0, -1)) {
        curr = curr.children[idx]
        newCollapsed.delete(curr.id)
      }
      
      // Update collapsed set in store
      useDocumentStore.setState({ collapsedNodeIds: newCollapsed })
    }

    // 2. Select node
    selectNode(nodeId)
    
    // 3. Scroll elements into view
    setTimeout(() => {
      const el =
        document.querySelector(`[placeholder="输入编织内容..."]`) ||
        document.querySelector(`[placeholder="输入节点内容..."]`) ||
        document.querySelector('.bg-zinc-900')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)

    onClose()
    toast.info('已定位到搜索节点')
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[400px] border-l border-zinc-200 bg-white/95 text-zinc-700 shadow-[0_0_40px_rgba(0,0,0,0.05)] backdrop-blur-xl flex flex-col transition-all duration-300 animate-slide-left font-sans">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-200/60 px-5 shrink-0 bg-white/50">
        <div className="flex items-center gap-2.5">
          <Search size={16} className="text-zinc-800 font-bold" strokeWidth={2.5} />
          <span className="font-semibold text-[15px] text-zinc-900 tracking-wide">搜索节点</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 transition focus:outline-none"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search Input Area */}
      <div className="p-5 border-b border-zinc-200/60 bg-zinc-50/50">
        <div className="relative shadow-sm rounded-lg">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-4 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 transition placeholder-zinc-400"
            placeholder="输入关键词进行搜索..."
            autoFocus
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
          {(filter.tag || filter.checked !== 'all') && (
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

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#FCFCFB]">
        {isSearching && (
          <div className="text-center text-xs text-zinc-400 py-8 font-medium">正在搜索...</div>
        )}

        {!isSearching && filteredResults.map((result) => (
          <button
            key={result.nodeId}
            onClick={() => handleResultClick(result.nodeId)}
            className="w-full text-left rounded-xl border border-zinc-200/60 bg-white p-3.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:border-zinc-300 transition-all flex flex-col gap-2 focus:outline-none"
          >
            {/* Breadcrumb Path */}
            {result.path && result.path.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 overflow-hidden truncate">
                <FolderOpen size={11} className="shrink-0" />
                <span>{result.path.join(' > ')}</span>
              </div>
            )}

            {/* Matching text */}
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

        {!isSearching && query.trim() !== '' && filteredResults.length === 0 && (
          <div className="text-center text-sm font-medium text-zinc-400 py-10">
            未找到匹配节点
          </div>
        )}

        {query.trim() === '' && (
          <div className="text-center text-xs font-medium text-zinc-400 py-10">
            输入关键词在当前文档中进行全文搜索
          </div>
        )}
      </div>
    </div>
  )
}
