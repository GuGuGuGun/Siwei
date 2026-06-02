import React from 'react'
import { ChevronDown } from 'lucide-react'
import type { LibraryDocumentItem, LibrarySearchResult } from '../../../types/library'

export function StatusPill({ status }: { status: LibraryDocumentItem['status'] }) {
  const label = {
    ready: '正常',
    missing: '缺失',
    invalid: '损坏',
    stale: '需刷新',
    indexing: '刷新中',
    error: '失败',
  }[status]
  const className = {
    ready: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    missing: 'bg-rose-50 text-rose-700 border-rose-100',
    invalid: 'bg-amber-50 text-amber-700 border-amber-100',
    stale: 'bg-sky-50 text-sky-700 border-sky-100',
    indexing: 'bg-blue-50 text-blue-700 border-blue-100',
    error: 'bg-rose-50 text-rose-700 border-rose-100',
  }[status]
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white/60 text-sm text-zinc-400">
      {text}
    </div>
  )
}

export function LoadMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-9 w-full items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white text-xs text-zinc-500 hover:bg-zinc-50">
      <ChevronDown size={14} />
      加载更多
    </button>
  )
}

export function sourceLabel(source: LibrarySearchResult['matchSources'][number]) {
  if (source === 'title') return '标题'
  if (source === 'content') return '节点内容'
  if (source === 'note') return '备注'
  if (source === 'tag') return '标签'
  return '正文'
}

export function failureReasonLabel(reason: NonNullable<LibraryDocumentItem['failureReason']>) {
  return {
    missingFile: '文件不存在',
    invalidJson: '文档格式无法解析',
    unsupportedVersion: '文档版本暂不支持',
    permissionDenied: '没有权限读取文件',
    indexWriteFailed: '索引写入失败',
    unknown: '刷新失败',
  }[reason]
}

export function formatTimestamp(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HighlightedText({ text, ranges }: { text: string; ranges: Array<{ start: number; end: number }> }) {
  if (ranges.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(<mark key={`${range.start}-${index}`} className="rounded bg-amber-100 px-0.5 text-zinc-900">{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
