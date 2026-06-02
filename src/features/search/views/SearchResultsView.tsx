import React from 'react'
import { CornerDownRight, FolderOpen } from 'lucide-react'
import type { SearchResult } from '../../../types/document'
import { HighlightedSearchText, sourceLabel } from '../searchPanelHelpers'

interface SearchResultsViewProps {
  query: string
  isSearching: boolean
  results: SearchResult[]
  onOpenResult: (nodeId: string) => void
}

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  query,
  isSearching,
  results,
  onOpenResult,
}) => {
  if (isSearching) {
    return <div className="py-8 text-center text-xs font-medium text-zinc-400">正在搜索...</div>
  }

  if (query.trim() !== '' && results.length === 0) {
    return <div className="py-10 text-center text-sm font-medium text-zinc-400">未找到匹配节点</div>
  }

  if (query.trim() === '') {
    return <div className="py-10 text-center text-xs font-medium text-zinc-400">输入关键词在当前文档中进行全文搜索</div>
  }

  return (
    <>
      {results.map((result) => (
        <button
          key={result.nodeId}
          type="button"
          onClick={() => onOpenResult(result.nodeId)}
          className="flex w-full flex-col gap-2 rounded-xl border border-zinc-200/60 bg-white p-3.5 text-left transition-all hover:border-zinc-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:outline-none"
        >
          {result.path && result.path.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-hidden truncate text-[10px] font-medium text-zinc-400">
              <FolderOpen size={11} className="shrink-0" />
              <span>{result.path.join(' > ')}</span>
            </div>
          )}

          <div className="flex items-start gap-2 text-[13px] leading-snug text-zinc-800">
            <CornerDownRight size={14} className="mt-0.5 shrink-0 text-zinc-300" />
            <div className="break-all font-medium">
              <HighlightedSearchText text={result.text} matchIndices={result.matchIndices} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pl-5">
            {result.matchSources.map((source) => (
              <span key={source} className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
                {sourceLabel(source)}
              </span>
            ))}
          </div>

          {result.matches
            .filter((match) => match.source !== 'text')
            .map((match, index) => (
              <div key={`${match.source}-${index}`} className="ml-5 mt-1 rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-600">
                <span className="mr-1.5 font-medium text-zinc-400">{sourceLabel(match.source)}:</span>
                {match.source === 'tag'
                  ? <span className="font-semibold text-zinc-700">#{match.value}</span>
                  : <HighlightedSearchText text={match.value} matchIndices={match.matchIndices} />}
              </div>
            ))}
        </button>
      ))}
    </>
  )
}
