import React from 'react'
import { Trash2 } from 'lucide-react'
import type { TagSummary } from '../../filter/filterUtils'

interface SearchTagsViewProps {
  tags: TagSummary[]
  onSelectTag: (tag: string) => void
  onRenameTag: (tag: string) => void
  onMergeTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
}

export const SearchTagsView: React.FC<SearchTagsViewProps> = ({
  tags,
  onSelectTag,
  onRenameTag,
  onMergeTag,
  onRemoveTag,
}) => {
  return (
    <>
      {tags.map((item) => (
        <div key={item.tag} className="rounded-lg border border-zinc-200/70 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => onSelectTag(item.tag)} className="flex min-w-0 items-center gap-2 text-left focus:outline-none">
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">#{item.tag}</span>
              <span className="text-[11px] text-zinc-400">{item.count} 个节点</span>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onRenameTag(item.tag)} className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                重命名
              </button>
              <button type="button" onClick={() => onMergeTag(item.tag)} className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                合并
              </button>
              <button type="button" onClick={() => onRemoveTag(item.tag)} className="rounded p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" title="删除标签">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {tags.length === 0 && (
        <div className="py-10 text-center text-xs font-medium text-zinc-400">当前文档没有标签</div>
      )}
    </>
  )
}
