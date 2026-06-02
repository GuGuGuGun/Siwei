import React from 'react'
import { Columns, Grid, List, type LucideIcon } from 'lucide-react'
import type { ViewMode } from '../../features/document/documentStore'

interface ViewSwitcherProps {
  viewMode: ViewMode
  onViewModeChange: (viewMode: ViewMode) => void
}

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ viewMode, onViewModeChange }) => {
  const items: Array<{ key: ViewMode; label: string; icon: LucideIcon }> = [
    { key: 'outline', label: '大纲', icon: List },
    { key: 'mindmap', label: '思维导图', icon: Grid },
    { key: 'split', label: '分屏', icon: Columns },
  ]

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-zinc-200/70 bg-zinc-100/80 p-0.5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800/80">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onViewModeChange(item.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-3 py-1 text-xs font-medium tracking-wide transition-all ${
              viewMode === item.key
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-200'
            }`}
          >
            <Icon size={14} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
