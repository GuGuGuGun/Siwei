import React from 'react'
import type { LibraryTagSummary } from '../../../types/library'
import { EmptyState, LoadMoreButton } from '../components/LibraryShared'

interface LibraryTagsViewProps {
  tags: LibraryTagSummary[]
  hasMore: boolean
  onSelectTag: (tag: string) => void
  onLoadMore: () => void
}

export const LibraryTagsView: React.FC<LibraryTagsViewProps> = ({
  tags,
  hasMore,
  onSelectTag,
  onLoadMore,
}) => {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {tags.map((tag) => (
        <button key={tag.tag} type="button" onClick={() => onSelectTag(tag.tag)} className="rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-zinc-300">
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
      {hasMore && <LoadMoreButton onClick={onLoadMore} />}
      {tags.length === 0 && <EmptyState text="文档库中还没有标签" />}
    </div>
  )
}
