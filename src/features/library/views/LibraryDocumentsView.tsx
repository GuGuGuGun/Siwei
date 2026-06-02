import React from 'react'
import { FolderSearch, RefreshCw, Trash2 } from 'lucide-react'
import type { LibraryDocumentItem } from '../../../types/library'
import {
  EmptyState,
  failureReasonLabel,
  formatTimestamp,
  LoadMoreButton,
  StatusPill,
} from '../components/LibraryShared'
import type { LibraryStatusFilter } from '../libraryStore'

interface LibraryDocumentsViewProps {
  docs: LibraryDocumentItem[]
  hasMore: boolean
  statusFilter: LibraryStatusFilter
  keyword: string
  sortBy: 'updatedAt' | 'title' | 'taskCount' | 'tagCount' | 'status'
  onStatusFilterChange: (status: LibraryStatusFilter) => void
  onKeywordChange: (keyword: string) => void
  onSortByChange: (sortBy: 'updatedAt' | 'title' | 'taskCount' | 'tagCount' | 'status') => void
  onReload: () => void
  onLoadMore: () => void
  onOpen: (doc: LibraryDocumentItem) => void
  onRefresh: (doc: LibraryDocumentItem) => void
  onOpenLocation: (doc: LibraryDocumentItem) => void
  onRemove: (doc: LibraryDocumentItem) => void
  onRemoveMissing: () => void
}

export const LibraryDocumentsView: React.FC<LibraryDocumentsViewProps> = ({
  docs,
  hasMore,
  statusFilter,
  keyword,
  sortBy,
  onStatusFilterChange,
  onKeywordChange,
  onSortByChange,
  onReload,
  onLoadMore,
  onOpen,
  onRefresh,
  onOpenLocation,
  onRemove,
  onRemoveMissing,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          onBlur={onReload}
          className="h-8 w-64 rounded-md border border-zinc-200 bg-white px-2.5 text-xs outline-none focus:border-zinc-400"
          placeholder="按标题或路径过滤"
        />
        <select value={statusFilter} onChange={(event) => { onStatusFilterChange(event.target.value as LibraryStatusFilter); onReload() }} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs">
          <option value="all">全部状态</option>
          <option value="failed">仅查看失败项</option>
          <option value="ready">已同步</option>
          <option value="stale">需刷新</option>
          <option value="missing">文件未找到</option>
          <option value="invalid">无法读取</option>
          <option value="indexing">正在刷新</option>
          <option value="error">刷新失败</option>
        </select>
        <select value={sortBy} onChange={(event) => { onSortByChange(event.target.value as typeof sortBy); onReload() }} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs">
          <option value="updatedAt">最近更新</option>
          <option value="title">标题</option>
          <option value="taskCount">任务数</option>
          <option value="tagCount">标签数</option>
          <option value="status">状态</option>
        </select>
        <button type="button" onClick={onRemoveMissing} className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-600 hover:bg-zinc-50">
          移除缺失记录
        </button>
      </div>
      {docs.length === 0 && <EmptyState text="还没有加入文档库的本地文档" />}
      {docs.map((doc) => (
        <div key={doc.documentId} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <button type="button" onClick={() => onOpen(doc)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900">{doc.title || '未命名文档'}</span>
                <StatusPill status={doc.status} />
              </div>
              <div className="mt-1 truncate text-xs text-zinc-400">{doc.path}</div>
              {(doc.errorSummary || doc.failureReason) && (
                <div className="mt-2 text-xs text-rose-600">
                  {doc.failureReason ? `${failureReasonLabel(doc.failureReason)}：` : ''}
                  {doc.errorSummary ?? '刷新失败'}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{doc.nodeCount} 节点</span>
                <span>{doc.taskCount} 任务</span>
                <span>{doc.uncheckedTaskCount} 未完成</span>
                <span>{doc.tags.length} 标签</span>
                {doc.lastRefreshAt && <span>最近刷新 {formatTimestamp(doc.lastRefreshAt)}</span>}
                {doc.lastRefreshDurationMs !== undefined && <span>耗时 {doc.lastRefreshDurationMs}ms</span>}
              </div>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onRefresh(doc)} className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" title="刷新索引">
                <RefreshCw size={14} />
              </button>
              <button type="button" onClick={() => onOpenLocation(doc)} className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" title="打开文件位置">
                <FolderSearch size={14} />
              </button>
              <button type="button" onClick={() => onRemove(doc)} className="rounded-md p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" title="移出文档库">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
      {hasMore && <LoadMoreButton onClick={onLoadMore} />}
    </div>
  )
}
