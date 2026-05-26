import React from 'react'
import { Search, X, FolderOpen, CornerDownRight } from 'lucide-react'
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

  // Trigger search on query change (with a basic debounce or on change)
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
          className="bg-sky-500/30 text-sky-400 font-semibold px-0.5 rounded-sm border border-sky-500/20"
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 border-l border-zinc-800 bg-zinc-950/95 text-zinc-300 shadow-2xl backdrop-blur-md flex flex-col transition-all duration-300 animate-slide-left">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-900 px-4">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-sky-400" />
          <span className="font-semibold text-zinc-100">搜索节点</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition focus:outline-none"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-4 border-b border-zinc-900">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-850 bg-zinc-900 pl-10 pr-4 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition placeholder-zinc-600"
            placeholder="输入关键词进行搜索..."
            autoFocus
          />
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-500" />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isSearching && (
          <div className="text-center text-xs text-zinc-500 py-4">正在搜索...</div>
        )}

        {!isSearching && results.map((result) => (
          <button
            key={result.nodeId}
            onClick={() => handleResultClick(result.nodeId)}
            className="w-full text-left rounded-lg border border-zinc-900 bg-zinc-900/30 p-3 hover:bg-zinc-900 hover:border-zinc-800 transition flex flex-col gap-1.5 focus:outline-none"
          >
            {/* Breadcrumb Path */}
            {result.path && result.path.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono overflow-hidden truncate">
                <FolderOpen size={10} className="shrink-0" />
                <span>{result.path.join(' > ')}</span>
              </div>
            )}

            {/* Matching text */}
            <div className="flex items-start gap-1.5 text-sm text-zinc-200 leading-snug">
              <CornerDownRight size={14} className="shrink-0 mt-0.5 text-zinc-600" />
              <div className="break-all">
                {renderHighlightedText(result.text, result.matchIndices)}
              </div>
            </div>
          </button>
        ))}

        {!isSearching && query.trim() !== '' && results.length === 0 && (
          <div className="text-center text-sm text-zinc-600 py-8">
            未找到匹配的节点
          </div>
        )}

        {query.trim() === '' && (
          <div className="text-center text-xs text-zinc-600 py-8">
            输入关键词在当前文档中进行全文搜索
          </div>
        )}
      </div>
    </div>
  )
}
