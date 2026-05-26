import React from 'react'
import { Plus, FolderOpen, FileText, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '../../features/document/documentStore'
import { useRecentStore } from '../../features/document/recentStore'
import { openFileDialog } from '../../services/siweiApi'
import { toast } from '../common/Toast'

export const Sidebar: React.FC = () => {
  const newDoc = useDocumentStore((s) => s.newDoc)
  const loadDoc = useDocumentStore((s) => s.loadDoc)
  const canDiscardCurrentDoc = useDocumentStore((s) => s.canDiscardCurrentDoc)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)
  
  const recentDocs = useRecentStore((s) => s.recentDocs)
  const loadRecents = useRecentStore((s) => s.loadRecents)
  const removeRecent = useRecentStore((s) => s.removeRecent)

  const [isCollapsed, setIsCollapsed] = React.useState(false)

  React.useEffect(() => {
    void loadRecents()
  }, [])

  const handleOpenDoc = async () => {
    if (!canDiscardCurrentDoc()) return

    try {
      const path = await openFileDialog(['siwei.json', 'json'])
      if (path) {
        await loadDoc(path)
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
      toast.success('已加载最近文档')
    } catch (e) {
      toast.error(`加载失败，文件可能已被移动: ${String(e)}`)
      await removeRecent(path)
    }
  }

  const handleNewDoc = async () => {
    if (!canDiscardCurrentDoc()) return

    try {
      await newDoc()
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
      className={`relative flex flex-col bg-canvas-sidebar text-zinc-600 transition-all duration-300 shadow-[1px_0_10px_rgba(0,0,0,0.02)] ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-12 items-center justify-between px-4 shrink-0 mt-2 mb-2">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white shadow-sm">
              S
            </div>
            <span className="font-sans text-sm font-semibold tracking-wide text-zinc-800">
              Siwei
            </span>
          </div>
        )}
        {isCollapsed && (
          <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white shadow-sm">
            S
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 hover:text-zinc-800 transition focus:outline-none shadow-sm"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Primary Actions */}
      <div className="flex flex-col gap-1.5 px-3 mb-4">
        <button
          onClick={handleNewDoc}
          className={`flex h-8 items-center justify-center gap-2 rounded-md bg-zinc-900 font-medium text-xs tracking-wide text-white hover:bg-zinc-800 transition shadow-sm ${
            isCollapsed ? 'px-0 w-8 mx-auto' : 'px-4 w-full'
          }`}
          title="新建文档"
        >
          <Plus size={14} />
          {!isCollapsed && <span>新建文档</span>}
        </button>
        <button
          onClick={handleOpenDoc}
          className={`flex h-8 items-center justify-center gap-2 rounded-md border border-zinc-200/60 bg-transparent font-medium text-xs tracking-wide text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 transition ${
            isCollapsed ? 'px-0 w-8 mx-auto border-none hover:bg-zinc-200/80' : 'px-4 w-full'
          }`}
          title="打开本地大纲"
        >
          <FolderOpen size={14} className={isCollapsed ? "text-zinc-500" : "text-zinc-500"} />
          {!isCollapsed && <span>打开文档</span>}
        </button>
      </div>

      {/* Recents list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {!isCollapsed && (
          <div className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-zinc-400">
            最近打开
          </div>
        )}

        <div className="space-y-0.5">
          {recentDocs.map((doc) => {
            const isActive = doc.path === currentFilePath
            return (
              <div
                key={doc.path}
                className={`group relative flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors ${
                  isActive
                    ? 'bg-zinc-200/80 text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800'
                } ${isCollapsed ? 'justify-center cursor-pointer px-0' : ''}`}
                onClick={() => isCollapsed && handleSelectRecent(doc.path)}
                title={doc.path}
              >
                {!isCollapsed ? (
                  <button
                    onClick={() => handleSelectRecent(doc.path)}
                    className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                  >
                    <FileText size={14} className={`shrink-0 ${isActive ? 'text-zinc-700' : 'text-zinc-400'}`} />
                    <div className="flex flex-col min-w-0">
                      <span className={`truncate text-[13px] leading-tight ${isActive ? 'font-medium' : 'font-normal'}`}>
                        {doc.title || '未命名'}
                      </span>
                    </div>
                  </button>
                ) : (
                  <FileText size={16} className={isActive ? 'text-zinc-800' : 'text-zinc-400'} />
                )}

                {/* Delete button */}
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeRecent(doc.path)
                      toast.info('已移除记录')
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-400 hover:bg-white hover:text-rose-500 transition shadow-sm"
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
          <span className="text-[10px]">Apple & Notion Inspired</span>
        </div>
      </div>
    </aside>
  )
}
