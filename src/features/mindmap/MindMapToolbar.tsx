import React from 'react'
import { Activity, GitBranch, LayoutDashboard, Move, Search, Sparkles, X } from 'lucide-react'
import type { MindMapLayoutStrategy } from '../../types/document'

export type MindMapMode = 'layout' | 'reorganize'

interface MindMapToolbarProps {
  mode: MindMapMode
  focused: boolean
  searchOpen: boolean
  experimentalLayoutEnabled: boolean
  strategy: MindMapLayoutStrategy
  onModeChange: (mode: MindMapMode) => void
  onStrategyChange: (strategy: MindMapLayoutStrategy) => void
  onAutoLayout: () => void
  onForceDirectedPreview: () => void
  onToggleDiagnostics: () => void
  onToggleSearch: () => void
  onResetFocus: () => void
}

export const MindMapToolbar: React.FC<MindMapToolbarProps> = ({
  mode,
  focused,
  searchOpen,
  experimentalLayoutEnabled,
  strategy,
  onModeChange,
  onStrategyChange,
  onAutoLayout,
  onForceDirectedPreview,
  onToggleDiagnostics,
  onToggleSearch,
  onResetFocus,
}) => {
  return (
    <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-amber-900/10 bg-[#FAF8F4]/95 p-1 shadow-fabric">
      <button
        type="button"
        aria-label="布局"
        title="布局"
        onClick={() => onModeChange('layout')}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
          mode === 'layout' ? 'bg-amber-100 text-amber-900' : 'text-zinc-500 hover:bg-amber-50'
        }`}
      >
        <Move className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="重组"
        title="重组"
        onClick={() => onModeChange('reorganize')}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
          mode === 'reorganize' ? 'bg-emerald-100 text-emerald-800' : 'text-zinc-500 hover:bg-amber-50'
        }`}
      >
        <GitBranch className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="自动整理"
        title="自动整理"
        onClick={onAutoLayout}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-amber-50"
      >
        <LayoutDashboard className="h-4 w-4" />
      </button>
      {experimentalLayoutEnabled && (
        <select
          aria-label="导图布局策略"
          title="导图布局策略"
          value={strategy}
          onChange={(event) => onStrategyChange(event.target.value as MindMapLayoutStrategy)}
          className="h-8 rounded-md border border-amber-900/10 bg-white px-2 text-xs font-medium text-zinc-600 outline-none transition hover:bg-amber-50 focus:ring-2 focus:ring-amber-200"
        >
          <option value="classic-dagre">经典</option>
          <option value="balanced-mindmap">平衡</option>
          <option value="radial-mindmap">径向</option>
          <option value="free-canvas">自由画布</option>
        </select>
      )}
      {experimentalLayoutEnabled && (
        <>
          <button
            type="button"
            aria-label="力导向预览"
            title="力导向预览"
            onClick={onForceDirectedPreview}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-amber-50"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="布局诊断"
            title="布局诊断"
            onClick={onToggleDiagnostics}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-amber-50"
          >
            <Activity className="h-4 w-4" />
          </button>
        </>
      )}
      <button
        type="button"
        aria-label="搜索导图"
        title="搜索导图"
        onClick={onToggleSearch}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
          searchOpen ? 'bg-sky-100 text-sky-800' : 'text-zinc-500 hover:bg-amber-50'
        }`}
      >
        <Search className="h-4 w-4" />
      </button>
      {focused && (
        <button
          type="button"
          aria-label="回到全图"
          title="回到全图"
          onClick={onResetFocus}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
