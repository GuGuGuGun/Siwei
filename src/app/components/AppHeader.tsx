import React from 'react'
import {
  Command as CommandIcon,
  FileInput,
  FileOutput,
  Presentation,
  Redo2,
  Save,
  Search,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from '../../components/common/Toast'
import type { ViewMode } from '../../features/document/documentStore'
import { ViewSwitcher } from './ViewSwitcher'

interface AppHeaderProps {
  viewMode: ViewMode
  canUndo: boolean
  canRedo: boolean
  isAgentOpen: boolean
  taskSummaryLabel?: string | null
  onViewModeChange: (viewMode: ViewMode) => void
  onUndo: () => void
  onRedo: () => void
  onOpenSearch: () => void
  onOpenCommand: () => void
  onToggleAgent: () => void
  onOpenImport: () => void
  onOpenExport: () => void
  onOpenPresentation: () => void
  onSave: () => Promise<boolean>
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  viewMode,
  canUndo,
  canRedo,
  isAgentOpen,
  taskSummaryLabel,
  onViewModeChange,
  onUndo,
  onRedo,
  onOpenSearch,
  onOpenCommand,
  onToggleAgent,
  onOpenImport,
  onOpenExport,
  onOpenPresentation,
  onSave,
}) => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16 }}
      className="z-10 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 overflow-hidden border-b border-zinc-200/60 bg-white/60 px-4 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-900/60"
    >
      <div className="flex min-w-0 items-center justify-start gap-2 overflow-hidden">
        <div className="cursor-default truncate px-2 text-sm font-medium text-zinc-600">Siwei Workspace</div>
        {taskSummaryLabel && (
          <div className="hidden shrink-0 rounded-md border border-amber-900/10 bg-[#FAF8F5] px-2.5 py-1 text-xs text-zinc-500 sm:inline-flex">
            {taskSummaryLabel}
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-center overflow-hidden">
        <ViewSwitcher viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-35"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 size={15} />
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-35"
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2 size={15} />
        </button>

        <div className="mx-1 h-4 w-[1px] bg-zinc-200" />

        <button
          type="button"
          onClick={onOpenSearch}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
          title="搜索 (Ctrl+F)"
        >
          <Search size={15} />
        </button>

        <button
          type="button"
          onClick={onOpenCommand}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
          title="命令面板 (Ctrl+K)"
        >
          <CommandIcon size={15} />
        </button>

        <button
          type="button"
          onClick={onToggleAgent}
          className={`btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none ${
            isAgentOpen ? 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900' : ''
          }`}
          title="文档助理"
        >
          <Sparkles size={15} />
        </button>

        <button
          type="button"
          onClick={onOpenPresentation}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
          title="演示模式"
          aria-label="演示模式"
        >
          <Presentation size={15} />
        </button>

        <button
          type="button"
          onClick={onOpenImport}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
          title="导入"
        >
          <FileInput size={15} />
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
          title="导出"
        >
          <FileOutput size={15} />
        </button>

        <div className="mx-1 h-4 w-[1px] bg-zinc-200" />

        <button
          type="button"
          onClick={() => void onSave().then((success) => {
            if (success) toast.success('保存成功')
          })}
          className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-95 focus:outline-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          title="保存 (Ctrl+S)"
        >
          <Save size={13} />
          保存
        </button>
      </div>
    </motion.header>
  )
}
