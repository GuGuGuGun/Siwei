import React from 'react'
import { Sidebar } from '../components/layout/Sidebar'
import { StatusBar } from '../components/layout/StatusBar'
import { OutlineEditor } from '../features/outline/OutlineEditor'
import { MindMapView } from '../features/mindmap/MindMapView'
import { SearchPanel } from '../features/search/SearchPanel'
import { Dialog } from '../components/common/Dialog'
import { ToastContainer, toast } from '../components/common/Toast'
import { useDocumentStore } from '../features/document/documentStore'
import { openFileDialog, saveFileDialog } from '../services/siweiApi'
import { Search, Save, FileOutput, FileInput, Grid, List, Columns, Sparkles } from 'lucide-react'

export const App: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const viewMode = useDocumentStore((s) => s.viewMode)
  const isDirty = useDocumentStore((s) => s.isDirty)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)

  const newDoc = useDocumentStore((s) => s.newDoc)
  const saveDoc = useDocumentStore((s) => s.saveDoc)
  const exportDoc = useDocumentStore((s) => s.exportDoc)
  const importDoc = useDocumentStore((s) => s.importDoc)
  const canDiscardCurrentDoc = useDocumentStore((s) => s.canDiscardCurrentDoc)
  const setViewMode = useDocumentStore((s) => s.setViewMode)

  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const [isImportOpen, setIsImportOpen] = React.useState(false)
  const [isExportOpen, setIsExportOpen] = React.useState(false)

  // Initialize doc
  React.useEffect(() => {
    void newDoc()
  }, [])

  // Auto-save debounce (if has active path)
  React.useEffect(() => {
    if (!currentDoc || !isDirty || !currentFilePath) return

    const timer = setTimeout(() => {
      void saveDoc()
    }, 1500)

    return () => clearTimeout(timer)
  }, [currentDoc, isDirty, currentFilePath])

  // Global Shortcuts
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveDoc().then((success) => {
          if (success) toast.success('已自动缝合保存至本地')
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (canDiscardCurrentDoc()) {
          void newDoc().then(() => toast.success('已新建文档'))
        }
      }
      if (e.altKey && e.key === '1') {
        e.preventDefault()
        setViewMode('outline')
      }
      if (e.altKey && e.key === '2') {
        e.preventDefault()
        setViewMode('mindmap')
      }
      if (e.altKey && e.key === '3') {
        e.preventDefault()
        setViewMode('split')
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [currentDoc, currentFilePath, canDiscardCurrentDoc])

  const handleImport = async (format: 'json' | 'markdown') => {
    if (!canDiscardCurrentDoc()) return

    try {
      const filters = format === 'markdown' ? ['md', 'markdown'] : ['siwei.json', 'json']
      const path = await openFileDialog(filters)
      if (path) {
        await importDoc(path, format)
        toast.success(`成功缝合导入 ${format === 'markdown' ? 'Markdown' : 'JSON'} 大纲`)
        setIsImportOpen(false)
      }
    } catch (err) {
      toast.error(`导入失败: ${String(err)}`)
    }
  }

  const handleExport = async (format: 'json' | 'markdown') => {
    if (!currentDoc) return
    try {
      const defaultName = `${currentDoc.title || '未命名织物'}.${format === 'markdown' ? 'md' : 'siwei.json'}`
      const path = await saveFileDialog(defaultName)
      if (path) {
        await exportDoc(path, format)
        toast.success(`成功导出 ${format === 'markdown' ? 'Markdown' : 'JSON'} 贴布文件`)
        setIsExportOpen(false)
      }
    } catch (err) {
      toast.error(`导出失败: ${String(err)}`)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-linen font-sans text-zinc-800 select-none">
      {/* Canvas Sidebar */}
      <Sidebar />

      {/* Main content workspace */}
      <div className="flex flex-1 flex-col overflow-hidden bg-linen">
        {/* Top Header Toolbar */}
        <header className="flex h-12 items-center justify-between border-b border-zinc-200/60 bg-white/60 backdrop-blur-md px-4 shrink-0 z-10">
          {/* Left: Placeholder for Title or Breadcrumbs */}
          <div className="flex-1 flex items-center justify-start">
            <div className="text-sm font-medium text-zinc-600 px-2 cursor-default">Siwei Workspace</div>
          </div>

          {/* Center: View Switching Tabs (macOS Segmented Control Style) */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-0.5 bg-zinc-100/80 p-0.5 rounded-md border border-zinc-200/50 shadow-sm">
            <button
              onClick={() => setViewMode('outline')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-xs font-medium tracking-wide transition-all ${
                viewMode === 'outline'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              <List size={14} />
              大纲
            </button>
            <button
              onClick={() => setViewMode('mindmap')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-xs font-medium tracking-wide transition-all ${
                viewMode === 'mindmap'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              <Grid size={14} />
              思维导图
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-xs font-medium tracking-wide transition-all ${
                viewMode === 'split'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              <Columns size={14} />
              分屏
            </button>
          </div>
          </div>

          {/* Right: Actions */}
          <div className="flex-1 flex items-center justify-end gap-1.5">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
              title="搜索 (Ctrl+F)"
            >
              <Search size={15} />
            </button>

            <button
              onClick={() => setIsImportOpen(true)}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
              title="导入"
            >
              <FileInput size={15} />
            </button>

            <button
              onClick={() => setIsExportOpen(true)}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
              title="导出"
            >
              <FileOutput size={15} />
            </button>

            <div className="h-4 w-[1px] bg-zinc-200 mx-1" />

            <button
              onClick={() => void saveDoc().then((success) => {
                if (success) toast.success('保存成功')
              })}
              className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-white hover:bg-zinc-800 active:scale-95 transition-all shadow-sm focus:outline-none"
              title="保存 (Ctrl+S)"
            >
              <Save size={13} />
              保存
            </button>
          </div>
        </header>

        {/* Content Workspace Area */}
        <main className="flex-1 overflow-hidden relative bg-linen">
          {viewMode === 'outline' && <OutlineEditor />}

          {viewMode === 'mindmap' && <MindMapView />}

          {viewMode === 'split' && (
            <div className="flex h-full w-full">
              <div className="w-1/2 h-full overflow-hidden border-r border-zinc-200/60">
                <OutlineEditor />
              </div>
              <div className="w-1/2 h-full overflow-hidden bg-[#FDFDFD]">
                <MindMapView />
              </div>
            </div>
          )}
        </main>

        {/* StatusBar */}
        <StatusBar />
      </div>

      {/* Global Panels */}
      <SearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Import Modal Dialog */}
      <Dialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="缝入外部文档">
        <div className="space-y-3 py-2 text-zinc-700">
          <p className="text-[11px] text-zinc-500 leading-relaxed mb-4">
            从本地磁盘选择要导入缝合的文件。Markdown 导入会自动解析无序缩进列表构建大纲画布。
          </p>
          <button
            onClick={() => handleImport('json')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-amber-900/15 bg-[#FAF9F5] text-left hover:bg-[#F3EFE7] hover:border-amber-900/35 transition-all shadow-sm"
          >
            <div>
              <div className="text-xs font-bold text-zinc-800 tracking-wide">缝合 JSON 贴布 (.siwei.json)</div>
              <div className="text-[10px] text-zinc-400 mt-1">加载完整的思帷大纲备份文件</div>
            </div>
            <Sparkles size={14} className="text-amber-600" />
          </button>
          <button
            onClick={() => handleImport('markdown')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-amber-900/15 bg-[#FAF9F5] text-left hover:bg-[#F3EFE7] hover:border-amber-900/35 transition-all shadow-sm"
          >
            <div>
              <div className="text-xs font-bold text-zinc-800 tracking-wide">缝合 Markdown 贴片 (.md)</div>
              <div className="text-[10px] text-amber-900/40 mt-1">解析缩进列表语法转换为树节点</div>
            </div>
            <Sparkles size={14} className="text-amber-700" />
          </button>
        </div>
      </Dialog>

      {/* Export Modal Dialog */}
      <Dialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} title="导出画布剪贴">
        <div className="space-y-3 py-2 text-zinc-700">
          <p className="text-[11px] text-zinc-500 leading-relaxed mb-4">
            将当前编织画布导出为本地文件备份。
          </p>
          <button
            onClick={() => handleExport('json')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-amber-900/15 bg-[#FAF9F5] text-left hover:bg-[#F3EFE7] hover:border-amber-900/35 transition-all shadow-sm"
          >
            <div>
              <div className="text-xs font-bold text-zinc-800 tracking-wide">导出 JSON 大纲 (.siwei.json)</div>
              <div className="text-[10px] text-zinc-400 mt-1">完整备份大纲树结构，包含节点元数据</div>
            </div>
            <Sparkles size={14} className="text-amber-600" />
          </button>
          <button
            onClick={() => handleExport('markdown')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-amber-900/15 bg-[#FAF9F5] text-left hover:bg-[#F3EFE7] hover:border-amber-900/35 transition-all shadow-sm"
          >
            <div>
              <div className="text-xs font-bold text-zinc-800 tracking-wide">导出 Markdown 大纲 (.md)</div>
              <div className="text-[10px] text-amber-900/40 mt-1">生成便于阅读的纯文本无序缩进列表</div>
            </div>
            <Sparkles size={14} className="text-amber-700" />
          </button>
        </div>
      </Dialog>

      {/* Toast alert system container */}
      <ToastContainer />
    </div>
  )
}
export default App
