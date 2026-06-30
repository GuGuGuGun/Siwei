import React from 'react'
import { Plus, FolderOpen, FileText, Trash2, ChevronLeft, ChevronRight, Database, Settings } from 'lucide-react'
import { useWorkspaceStore } from '../../app/workspaceStore'
import { useDocumentStore } from '../../features/document/documentStore'
import { useRecentStore } from '../../features/document/recentStore'
import { useLibraryStore } from '../../features/library/libraryStore'
import { useSettingsStore } from '../../features/settings/settingsStore'
import { openFileDialog } from '../../services/siweiApi'
import { toast } from '../common/Toast'

export const Sidebar: React.FC = () => {
  const newDoc = useDocumentStore((s) => s.newDoc)
  const loadDoc = useDocumentStore((s) => s.loadDoc)
  const canDiscardCurrentDoc = useDocumentStore((s) => s.canDiscardCurrentDoc)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)
  const setViewMode = useDocumentStore((s) => s.setViewMode)
  const setActiveLibraryView = useLibraryStore((s) => s.setActiveView)
  const activeWorkspaceView = useWorkspaceStore((s) => s.activeView)
  const setWorkspaceView = useWorkspaceStore((s) => s.setActiveView)
  const settings = useSettingsStore((s) => s.settings)
  const isCollapsed = settings.sidebarCollapsed
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  
  const recentDocs = useRecentStore((s) => s.recentDocs)
  const loadRecents = useRecentStore((s) => s.loadRecents)
  const removeRecent = useRecentStore((s) => s.removeRecent)

  const [invalidRecentPaths, setInvalidRecentPaths] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    void loadRecents()
  }, [])

  const handleOpenDoc = async () => {
    if (!canDiscardCurrentDoc()) return

    try {
      const path = await openFileDialog(['siwei.json', 'json'])
      if (path) {
        await loadDoc(path)
        setWorkspaceView('editor')
        toast.success('文档已打开')
      }
    } catch (e) {
      toast.error(`打开失败: ${String(e)}`)
    }
  }

  const handleSelectRecent = async (path: string) => {
    if (path === currentFilePath) return
    if (!canDiscardCurrentDoc()) return

    try {
      await loadDoc(path)
      setWorkspaceView('editor')
      setInvalidRecentPaths((paths) => {
        const next = new Set(paths)
        next.delete(path)
        return next
      })
      toast.success('已加载最近文档')
    } catch (e) {
      toast.error(`加载失败，文件可能已被移动: ${String(e)}`)
      setInvalidRecentPaths((paths) => new Set(paths).add(path))
    }
  }

  const handleClearInvalidRecents = async () => {
    const paths = [...invalidRecentPaths]
    for (const path of paths) {
      await removeRecent(path)
    }
    setInvalidRecentPaths(new Set())
    toast.info('已清理失效记录')
  }

  const handleNewDoc = async () => {
    if (!canDiscardCurrentDoc()) return

    try {
      setViewMode(settings.defaultViewMode)
      await newDoc()
      setWorkspaceView('editor')
      toast.success('已新建文档')
    } catch (e) {
      toast.error(`新建失败: ${String(e)}`)
    }
  }

  const formatTime = (time: number) => {
    const date = new Date(time)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes()
    ).padStart(2, '0')}`
  }

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col bg-canvas-sidebar text-zinc-600 shadow-[1px_0_10px_rgba(0,0,0,0.02)] transition-all duration-300 dark:border-r dark:border-zinc-800/60 dark:bg-zinc-950 dark:text-zinc-400 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="h-8 shrink-0 mt-2 mb-2">
        <button
          onClick={() => {
            void updateSettings({ sidebarCollapsed: !isCollapsed }).catch((error) => {
              toast.error(`侧栏设置保存失败: ${String(error)}`)
            })
          }}
          className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition hover:text-zinc-800 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:hover:text-zinc-200"
          title={isCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Primary Actions */}
      <div className="flex flex-col gap-1.5 px-3 mb-4">
        <button
          onClick={handleNewDoc}
          className={`flex h-8 items-center justify-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 font-medium text-xs tracking-wide text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition shadow-sm ${
            isCollapsed ? 'px-0 w-8 mx-auto' : 'px-4 w-full'
          }`}
          title={isCollapsed ? '新建文档' : undefined}
        >
          <Plus size={14} />
          {!isCollapsed && <span>新建文档</span>}
        </button>
        <button
          onClick={handleOpenDoc}
          className={`flex h-8 items-center justify-center gap-2 rounded-md border border-zinc-200/60 dark:border-zinc-800/80 bg-transparent font-medium text-xs tracking-wide text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200 transition ${
            isCollapsed ? 'px-0 w-8 mx-auto border-none hover:bg-zinc-200/80 dark:hover:bg-zinc-800' : 'px-4 w-full'
          }`}
          title="打开本地大纲"
        >
          <FolderOpen size={14} className={isCollapsed ? "text-zinc-500" : "text-zinc-500"} />
          {!isCollapsed && <span>打开文档</span>}
        </button>
        <button
          onClick={() => {
            setActiveLibraryView('docs')
            setWorkspaceView('library')
          }}
          className={`flex h-8 items-center justify-center gap-2 rounded-md border font-medium text-xs tracking-wide transition ${
            activeWorkspaceView === 'library'
              ? 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'border-zinc-200/60 dark:border-zinc-800/80 bg-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'
          } ${isCollapsed ? 'px-0 w-8 mx-auto border-none hover:bg-zinc-200/80 dark:hover:bg-zinc-800' : 'px-4 w-full'}`}
          title="文档库"
        >
          <Database size={14} className="text-zinc-500" />
          {!isCollapsed && <span>文档库</span>}
        </button>
        <button
          onClick={() => setWorkspaceView('settings')}
          className={`flex h-8 items-center justify-center gap-2 rounded-md border font-medium text-xs tracking-wide transition ${
            activeWorkspaceView === 'settings'
              ? 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'border-zinc-200/60 dark:border-zinc-800/80 bg-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'
          } ${isCollapsed ? 'px-0 w-8 mx-auto border-none hover:bg-zinc-200/80 dark:hover:bg-zinc-800' : 'px-4 w-full'}`}
          title="设置"
        >
          <Settings size={14} className="text-zinc-500" />
          {!isCollapsed && <span>设置</span>}
        </button>
      </div>

      {/* Recents list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {!isCollapsed && (
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[11px] font-semibold tracking-wide text-zinc-400">最近打开</span>
            {invalidRecentPaths.size > 0 && (
              <button
                type="button"
                onClick={handleClearInvalidRecents}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              >
                清理失效
              </button>
            )}
          </div>
        )}

        <div className="space-y-0.5">
          {recentDocs.map((doc) => {
            const isActive = doc.path === currentFilePath
            const isInvalid = invalidRecentPaths.has(doc.path)
            return (
              <div
                key={doc.path}
                className={`group relative flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors ${
                  isInvalid
                    ? 'bg-rose-50/70 dark:bg-rose-900/20 text-rose-500'
                    : isActive
                    ? 'bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
                } ${isCollapsed ? 'justify-center cursor-pointer px-0' : ''}`}
                onClick={() => isCollapsed && handleSelectRecent(doc.path)}
                title={doc.path}
              >
                {!isCollapsed ? (
                  <button
                    onClick={() => handleSelectRecent(doc.path)}
                    className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                  >
                    <FileText size={14} className={`shrink-0 ${isActive ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400'}`} />
                    <div className="flex flex-col min-w-0">
                      <span className={`truncate text-[13px] leading-tight ${isActive ? 'font-medium' : 'font-normal'}`}>
                        {doc.title || '未命名'}
                      </span>
                      {isInvalid && (
                        <span className="text-[10px] leading-tight text-rose-400">路径失效，点击删除按钮移除</span>
                      )}
                    </div>
                  </button>
                ) : (
                  <FileText size={16} className={isActive ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-500'} />
                )}

                {/* Delete button */}
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeRecent(doc.path)
                      toast.info('已移除记录')
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-400 hover:bg-white dark:hover:bg-zinc-700 hover:text-rose-500 transition shadow-sm"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
          {recentDocs.length === 0 && !isCollapsed && (
            <div className="px-3 py-6 text-center text-[13px] text-zinc-400">
              无最近文档
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 mb-2">
        <div className={`flex items-center gap-2 text-zinc-400 font-medium ${isCollapsed ? 'justify-center' : 'px-3'}`}>
          <span className="text-[10px]">思帷</span>
        </div>
      </div>
    </aside>
  )
}
