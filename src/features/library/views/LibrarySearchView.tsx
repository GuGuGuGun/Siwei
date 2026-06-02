import React from 'react'
import { Search } from 'lucide-react'
import type { LibraryDocumentItem, LibrarySearchResult } from '../../../types/library'
import { EmptyState, HighlightedText, LoadMoreButton, sourceLabel } from '../components/LibraryShared'
import type { LibraryMatchedFieldFilter, LibraryStatusFilter } from '../libraryStore'

interface LibrarySearchViewProps {
  query: string
  results: LibrarySearchResult[]
  hasMore: boolean
  statusFilter: LibraryStatusFilter
  fieldFilter: LibraryMatchedFieldFilter
  onQueryChange: (query: string) => void
  onStatusFilterChange: (status: LibraryStatusFilter) => void
  onFieldFilterChange: (field: LibraryMatchedFieldFilter) => void
  onReload: () => void
  onLoadMore: () => void
  onOpen: (result: LibrarySearchResult) => void
}

export const LibrarySearchView: React.FC<LibrarySearchViewProps> = ({
  query,
  results,
  hasMore,
  statusFilter,
  fieldFilter,
  onQueryChange,
  onStatusFilterChange,
  onFieldFilterChange,
  onReload,
  onLoadMore,
  onOpen,
}) => {
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
      <div className="flex flex-wrap gap-2">
        <select value={statusFilter} onChange={(event) => { onStatusFilterChange(event.target.value as LibraryStatusFilter); onReload() }} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs">
          <option value="all">全部状态</option>
          <option value="failed">仅查看失败项</option>
          <option value="ready">已同步</option>
          <option value="stale">需刷新</option>
          <option value="missing">文件未找到</option>
          <option value="invalid">无法读取</option>
          <option value="error">刷新失败</option>
        </select>
        <select value={fieldFilter} onChange={(event) => { onFieldFilterChange(event.target.value as LibraryMatchedFieldFilter); onReload() }} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs">
          <option value="all">全部字段</option>
          <option value="title">标题</option>
          <option value="content">节点内容</option>
          <option value="note">备注</option>
          <option value="tag">标签</option>
        </select>
      </div>
      <div className="space-y-2">
        {results.map((result) => (
          <button key={`${result.documentId}-${result.nodeId ?? 'title'}-${result.matchSources.join('-')}`} type="button" onClick={() => onOpen(result)} className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-zinc-300">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-zinc-500">{result.documentTitle}</span>
              <span className="text-[10px] text-zinc-400">{(result.matchedFields ?? result.matchSources).map(sourceLabel).join(' · ')}</span>
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-800">
              <HighlightedText text={result.snippet ?? result.text ?? result.documentTitle} ranges={result.highlightRanges ?? []} />
            </div>
            {result.path.length > 0 && <div className="mt-1 text-xs text-zinc-400">{result.path.join(' > ')}</div>}
          </button>
        ))}
        {query.trim() && results.length === 0 && <EmptyState text="没有找到匹配结果" />}
        {!query.trim() && <EmptyState text="输入关键词开始跨文档搜索" />}
        {hasMore && <LoadMoreButton onClick={onLoadMore} />}
      </div>
    </div>
  )
}

export type LibrarySearchStatusFilter = LibraryDocumentItem['status'] | 'failed' | 'all'
