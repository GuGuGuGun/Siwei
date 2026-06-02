import React from 'react'
import type { SearchResult } from '../../types/document'

export function HighlightedSearchText({
  text,
  matchIndices,
}: {
  text: string
  matchIndices: Array<[number, number]>
}) {
  if (!matchIndices || matchIndices.length === 0) return <span>{text}</span>

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const sortedIndices = [...matchIndices].sort((a, b) => a[0] - b[0])

  sortedIndices.forEach(([start, end], index) => {
    if (start > lastIndex) {
      parts.push(<span key={`text-${index}`}>{text.substring(lastIndex, start)}</span>)
    }
    parts.push(
      <mark
        key={`match-${index}`}
        className="rounded-[2px] bg-amber-100 px-0.5 font-semibold text-amber-900"
      >
        {text.substring(start, end)}
      </mark>,
    )
    lastIndex = end
  })

  if (lastIndex < text.length) {
    parts.push(<span key="text-end">{text.substring(lastIndex)}</span>)
  }

  return <>{parts}</>
}

export function sourceLabel(source: SearchResult['matchSources'][number]) {
  if (source === 'note') return '备注命中'
  if (source === 'tag') return '标签命中'
  return '正文命中'
}
