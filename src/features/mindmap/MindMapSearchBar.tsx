import React from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'

interface MindMapSearchBarProps {
  query: string
  matchCount: number
  activeIndex: number
  onQueryChange: (query: string) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

export const MindMapSearchBar: React.FC<MindMapSearchBarProps> = ({
  query,
  matchCount,
  activeIndex,
  onQueryChange,
  onPrevious,
  onNext,
  onClose,
}) => {
  const resultText = query.trim()
    ? matchCount > 0
      ? `${activeIndex + 1}/${matchCount}`
      : '未找到匹配节点'
    : '输入关键词搜索导图'

  return (
    <div className="absolute left-4 top-16 z-10 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-lg border border-amber-900/10 bg-[#FAF8F4]/95 p-2 shadow-fabric">
      <Search className="h-4 w-4 shrink-0 text-zinc-400" />
      <input
        aria-label="导图搜索关键词"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="输入关键词搜索导图"
        className="h-8 w-56 min-w-0 rounded-md border border-amber-900/10 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-amber-500"
      />
      <span className="min-w-[4.5rem] text-center text-[11px] text-zinc-500">{resultText}</span>
      <button
        type="button"
        aria-label="上一个结果"
        title="上一个结果"
        disabled={matchCount === 0}
        onClick={onPrevious}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition enabled:hover:bg-amber-50 disabled:text-zinc-300"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="下一个结果"
        title="下一个结果"
        disabled={matchCount === 0}
        onClick={onNext}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition enabled:hover:bg-amber-50 disabled:text-zinc-300"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="关闭导图搜索"
        title="关闭导图搜索"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-amber-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
