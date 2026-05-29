import React from 'react'
import { Command } from 'cmdk'
import { Search, FileText, Plus, Columns, Grid, List, Moon, Sun, Monitor, Maximize } from 'lucide-react'
import { useSettingsStore } from '../../features/settings/settingsStore'
import { useDocumentStore } from '../../features/document/documentStore'
import { useWorkspaceStore } from '../../app/workspaceStore'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNewDoc: () => void
  onImport: () => void
  onExport: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNewDoc, onImport, onExport }) => {
  const setViewMode = useDocumentStore((s) => s.setViewMode)
  const setWorkspaceView = useWorkspaceStore((s) => s.setActiveView)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[15vh] backdrop-blur-sm dark:bg-black/45"
      onClick={onClose}
      role="presentation"
    >
      <div 
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
      >
        <Command className="flex flex-col w-full h-full">
          <div className="flex items-center px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <Search size={18} className="text-zinc-400 mr-2 shrink-0" />
            <Command.Input 
              autoFocus
              placeholder="输入命令..." 
              className="flex-1 bg-transparent text-zinc-800 dark:text-zinc-200 outline-none placeholder:text-zinc-400"
            />
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar-hide">
            <Command.Empty className="py-6 text-center text-sm text-zinc-500">没有找到结果。</Command.Empty>

            <Command.Group heading="视图模式" className="text-xs font-medium text-zinc-500 px-2 py-1.5 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2">
              <Command.Item 
                onSelect={() => { setViewMode('outline'); setWorkspaceView('editor'); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <List size={16} className="mr-2" /> 切换至 大纲视图
              </Command.Item>
              <Command.Item 
                onSelect={() => { setViewMode('mindmap'); setWorkspaceView('editor'); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Grid size={16} className="mr-2" /> 切换至 导图视图
              </Command.Item>
              <Command.Item 
                onSelect={() => { setViewMode('split'); setWorkspaceView('editor'); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Columns size={16} className="mr-2" /> 切换至 分屏视图
              </Command.Item>
              <Command.Item 
                onSelect={() => { updateSettings({ focusMode: !settings.focusMode }); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Maximize size={16} className="mr-2" /> 开启/关闭 专注模式
              </Command.Item>
            </Command.Group>

            <Command.Group heading="文档操作" className="text-xs font-medium text-zinc-500 px-2 py-1.5 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2">
              <Command.Item 
                onSelect={() => { onNewDoc(); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Plus size={16} className="mr-2" /> 新建文档
              </Command.Item>
              <Command.Item 
                onSelect={() => { onImport(); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <FileText size={16} className="mr-2" /> 导入文档...
              </Command.Item>
              <Command.Item 
                onSelect={() => { onExport(); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <FileText size={16} className="mr-2" /> 导出当前文档...
              </Command.Item>
            </Command.Group>

            <Command.Group heading="主题设置" className="text-xs font-medium text-zinc-500 px-2 py-1.5 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2">
              <Command.Item 
                onSelect={() => { updateSettings({ theme: 'light' }); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Sun size={16} className="mr-2" /> 浅色模式
              </Command.Item>
              <Command.Item 
                onSelect={() => { updateSettings({ theme: 'dark' }); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Moon size={16} className="mr-2" /> 深色模式
              </Command.Item>
              <Command.Item 
                onSelect={() => { updateSettings({ theme: 'system' }); onClose() }}
                className="flex items-center px-2 py-2 text-sm rounded-md text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 aria-selected:text-zinc-900 dark:aria-selected:text-white cursor-pointer"
              >
                <Monitor size={16} className="mr-2" /> 跟随系统
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
