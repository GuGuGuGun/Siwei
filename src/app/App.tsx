import React from 'react'
import { Sidebar } from '../components/layout/Sidebar'
import { StatusBar } from '../components/layout/StatusBar'
import { OutlineEditor } from '../features/outline/OutlineEditor'
import { MindMapView } from '../features/mindmap/MindMapView'
import { SearchPanel } from '../features/search/SearchPanel'
import { LibraryWorkspace } from '../features/library/LibraryWorkspace'
import { SettingsPage } from '../features/settings/SettingsPage'
import { Dialog } from '../components/common/Dialog'
import { ToastContainer, toast } from '../components/common/Toast'
import { useDocumentStore } from '../features/document/documentStore'
import { useSettingsStore } from '../features/settings/settingsStore'
import { useWorkspaceStore } from './workspaceStore'
import { useAgentStore } from '../features/agent/agentStore'
import { AgentPanel } from '../features/agent/AgentPanel'
import { mindMapExportController } from '../features/mindmap/mindMapExportController'
import { openFileDialog, saveFileDialog } from '../services/siweiApi'
import { Search, Save, FileOutput, FileInput, Grid, List, Columns, Sparkles, Undo2, Redo2, FileImage, FileText, Command as CommandIcon, LogOut } from 'lucide-react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { AnimatePresence, motion } from 'framer-motion'
import { CommandPalette } from '../components/common/CommandPalette'

export const App: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const viewMode = useDocumentStore((s) => s.viewMode)
  const isDirty = useDocumentStore((s) => s.isDirty)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)
  const canUndo = useDocumentStore((s) => s.canUndo)
  const canRedo = useDocumentStore((s) => s.canRedo)
  const settings = useSettingsStore((s) => s.settings)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const activeWorkspaceView = useWorkspaceStore((s) => s.activeView)
  const isAgentOpen = useAgentStore((s) => s.isOpen)
  const setAgentOpen = useAgentStore((s) => s.setOpen)

  const newDoc = useDocumentStore((s) => s.newDoc)
  const saveDoc = useDocumentStore((s) => s.saveDoc)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const exportDoc = useDocumentStore((s) => s.exportDoc)
  const importDoc = useDocumentStore((s) => s.importDoc)
  const canDiscardCurrentDoc = useDocumentStore((s) => s.canDiscardCurrentDoc)
  const setViewMode = useDocumentStore((s) => s.setViewMode)

  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const [isImportOpen, setIsImportOpen] = React.useState(false)
  const [isExportOpen, setIsExportOpen] = React.useState(false)
  const [isCommandOpen, setIsCommandOpen] = React.useState(false)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const didInitializeRef = React.useRef(false)

  // 首屏文档和设置并行加载，避免设置 I/O 慢时长时间停在空白壳层。
  React.useEffect(() => {
    if (didInitializeRef.current) return
    didInitializeRef.current = true

    void newDoc()
    void loadSettings().then(() => {
      const defaultViewMode = useSettingsStore.getState().settings.defaultViewMode
      setViewMode(defaultViewMode)
    }).catch((error) => {
      toast.error(`加载设置失败: ${String(error)}`)
    })
  }, [loadSettings, newDoc, setViewMode])

  // Auto-save debounce (if has active path)
  React.useEffect(() => {
    if (!settings.autoSaveEnabled) return
    if (!currentDoc || !isDirty || !currentFilePath) return

    const timer = setTimeout(() => {
      void saveDoc()
    }, settings.autoSaveIntervalMs)

    return () => clearTimeout(timer)
  }, [currentDoc, isDirty, currentFilePath, saveDoc, settings.autoSaveEnabled, settings.autoSaveIntervalMs])

  // Theme management keeps the DOM class as the single Tailwind dark-mode switch.
  React.useEffect(() => {
    const root = window.document.documentElement
    const applyTheme = (theme: 'light' | 'dark' | 'system') => {
      root.classList.remove('light', 'dark')
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        root.classList.add(systemTheme)
      } else {
        root.classList.add(theme)
      }
    }
    applyTheme(settings.theme)

    if (settings.theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => applyTheme('system')
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [settings.theme])

  // Global Shortcuts
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveDoc().then((success) => {
          if (success) toast.success('已自动缝合保存至本地')
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCommandOpen((prev) => !prev)
      }
      if (e.key === 'F11' || ((e.ctrlKey || e.metaKey) && e.key === '\\')) {
        e.preventDefault()
        void updateSettings({ focusMode: !useSettingsStore.getState().settings.focusMode }).catch((error) => {
          toast.error(`专注模式切换失败: ${String(error)}`)
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (canDiscardCurrentDoc()) {
          setViewMode(useSettingsStore.getState().settings.defaultViewMode)
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
  }, [currentDoc, currentFilePath, canDiscardCurrentDoc, undo, redo, newDoc, saveDoc, setViewMode, updateSettings])

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

  const isMindMapVisible = activeWorkspaceView === 'editor' && (viewMode === 'mindmap' || viewMode === 'split')

  const handleTopExportClick = () => {
    setIsExportOpen(true)
  }

  const handleMindMapExport = (format: 'png' | 'pdf') => {
    mindMapExportController.current.exportMindMap?.(format)
    setIsExportOpen(false)
  }

  const exitFocusMode = () => {
    void updateSettings({ focusMode: false }).catch((error) => {
      toast.error(`退出专注模式失败: ${String(error)}`)
    })
  }

  const viewSwitcher = (
    <div className="flex items-center gap-0.5 rounded-md border border-zinc-200/70 bg-zinc-100/80 p-0.5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800/80">
      <button
        onClick={() => setViewMode('outline')}
        className={`flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-xs font-medium tracking-wide transition-all ${
          viewMode === 'outline'
            ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
            : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-200'
        }`}
      >
        <List size={14} />
        大纲
      </button>
      <button
        onClick={() => setViewMode('mindmap')}
        className={`flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-xs font-medium tracking-wide transition-all ${
          viewMode === 'mindmap'
            ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
            : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-200'
        }`}
      >
        <Grid size={14} />
        思维导图
      </button>
      <button
        onClick={() => setViewMode('split')}
        className={`flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-xs font-medium tracking-wide transition-all ${
          viewMode === 'split'
            ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
            : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-200'
        }`}
      >
        <Columns size={14} />
        分屏
      </button>
    </div>
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-linen font-sans text-zinc-800 dark:text-zinc-200 select-none">
      {!settings.focusMode && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-linen dark:bg-zinc-950">
        {!settings.focusMode && (
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.16 }}
          className="flex h-12 items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md px-4 shrink-0 z-10"
        >
          <div className="flex-1 flex items-center justify-start">
            <div className="text-sm font-medium text-zinc-600 px-2 cursor-default">Siwei Workspace</div>
          </div>

          <div className="flex-1 flex items-center justify-center">
            {viewSwitcher}
          </div>

          <div className="flex-1 flex items-center justify-end gap-1.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-35"
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 size={15} />
            </button>

            <button
              onClick={redo}
              disabled={!canRedo}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-35"
              title="重做 (Ctrl+Shift+Z)"
            >
              <Redo2 size={15} />
            </button>

            <div className="h-4 w-[1px] bg-zinc-200 mx-1" />

            <button
              onClick={() => setIsSearchOpen(true)}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
              title="搜索 (Ctrl+F)"
            >
              <Search size={15} />
            </button>

            <button
              onClick={() => setIsCommandOpen(true)}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
              title="命令面板 (Ctrl+K)"
            >
              <CommandIcon size={15} />
            </button>

            <button
              onClick={() => setAgentOpen(!isAgentOpen)}
              className={`btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none ${
                isAgentOpen ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800' : ''
              }`}
              title="文档助理"
            >
              <Sparkles size={15} />
            </button>

            <button
              onClick={() => setIsImportOpen(true)}
              className="btn-patch-light flex h-8 w-8 items-center justify-center rounded-md focus:outline-none"
              title="导入"
            >
              <FileInput size={15} />
            </button>

            <button
              onClick={handleTopExportClick}
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
              className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-white hover:bg-zinc-800 active:scale-95 transition-all shadow-sm focus:outline-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              title="保存 (Ctrl+S)"
            >
              <Save size={13} />
              保存
            </button>
          </div>
        </motion.header>
        )}

        <main className="flex-1 overflow-hidden relative bg-linen dark:bg-zinc-950">
          <div className="flex h-full w-full overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait">
                {activeWorkspaceView === 'library' ? (
                  <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full w-full absolute inset-0">
                    <LibraryWorkspace />
                  </motion.div>
                ) : activeWorkspaceView === 'settings' ? (
                  <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full w-full absolute inset-0">
                    <SettingsPage />
                  </motion.div>
                ) : (
                  <motion.div key={viewMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full w-full absolute inset-0 bg-linen dark:bg-zinc-950">
                    {viewMode === 'outline' && <OutlineEditor />}

                    {viewMode === 'mindmap' && <MindMapView />}

                    {viewMode === 'split' && (
                      <PanelGroup orientation="horizontal">
                        <Panel defaultSize={50} minSize={20}>
                          <div className="h-full overflow-hidden border-r border-zinc-200/60 dark:border-zinc-800/60">
                            <OutlineEditor />
                          </div>
                        </Panel>
                        <PanelResizeHandle className="PanelResizeHandle" />
                        <Panel defaultSize={50} minSize={20}>
                          <div className="h-full overflow-hidden bg-[#FDFDFD] dark:bg-[#121212]">
                            <MindMapView />
                          </div>
                        </Panel>
                      </PanelGroup>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {isAgentOpen && <AgentPanel />}
          </div>
        </main>
        {/* StatusBar */}
        {!settings.focusMode && <StatusBar />}
      </div>

      {/* Global Panels */}
      <SearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} onNewDoc={() => {
        if (canDiscardCurrentDoc()) {
          setViewMode(useSettingsStore.getState().settings.defaultViewMode)
          void newDoc().then(() => toast.success('已新建文档'))
        }
      }} onImport={() => setIsImportOpen(true)} onExport={handleTopExportClick} />

      {settings.focusMode && (
        <>
          <div className="fixed left-1/2 top-3 z-40 -translate-x-1/2">
            {viewSwitcher}
          </div>
          <button
            type="button"
            onClick={exitFocusMode}
            className="fixed right-4 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200/70 bg-white/80 text-zinc-500 shadow-sm backdrop-blur-md transition hover:bg-white hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus:ring-zinc-700"
            title="退出专注模式"
            aria-label="退出专注模式"
          >
            <LogOut size={15} />
          </button>
        </>
      )}

      {/* Import Modal Dialog */}
      <Dialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="导入文档">
        <div className="space-y-3 py-2 text-zinc-700 dark:text-zinc-300">
          <p className="text-[12px] text-zinc-500 leading-relaxed mb-4">
            从本地磁盘选择要导入的文件。Markdown 导入会自动解析无序缩进列表构建大纲。
          </p>
          <button
            onClick={() => handleImport('json')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm group"
          >
            <div>
              <div className="text-[13px] font-semibold tracking-wide">导入 JSON 备份 (.siwei.json)</div>
              <div className="text-[11px] text-zinc-500 mt-1">加载完整的思帷大纲备份文件</div>
            </div>
            <Sparkles size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
          </button>
          <button
            onClick={() => handleImport('markdown')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm group"
          >
            <div>
              <div className="text-[13px] font-semibold tracking-wide">导入 Markdown (.md)</div>
              <div className="text-[11px] text-zinc-500 mt-1">解析缩进列表语法转换为树节点</div>
            </div>
            <Sparkles size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
          </button>
        </div>
      </Dialog>

      {/* Export Modal Dialog */}
      <Dialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} title="导出文档">
        <div className="space-y-3 py-2 text-zinc-700 dark:text-zinc-300">
          <p className="text-[12px] text-zinc-500 leading-relaxed mb-4">
            将当前大纲导出为本地文件备份。
          </p>
          <button
            onClick={() => handleExport('json')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm group"
          >
            <div>
              <div className="text-[13px] font-semibold tracking-wide">导出 JSON 备份 (.siwei.json)</div>
              <div className="text-[11px] text-zinc-500 mt-1">完整备份大纲树结构，包含节点元数据</div>
            </div>
            <Sparkles size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
          </button>
          <button
            onClick={() => handleExport('markdown')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm group"
          >
            <div>
              <div className="text-[13px] font-semibold tracking-wide">导出 Markdown (.md)</div>
              <div className="text-[11px] text-zinc-500 mt-1">生成便于阅读的纯文本无序缩进列表</div>
            </div>
            <Sparkles size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
          </button>
          {isMindMapVisible && (
            <>
              <div className="my-4 h-px bg-zinc-200/80 dark:bg-zinc-800" />
              <button
                onClick={() => handleMindMapExport('png')}
                disabled={mindMapExportController.current.status === 'exporting'}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-amber-50/80 dark:bg-amber-900/20 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/40 hover:border-amber-200 dark:hover:border-amber-700/50 transition-all shadow-sm group disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div>
                  <div className="text-[13px] font-semibold tracking-wide">
                    {mindMapExportController.current.status === 'exporting' ? '正在导出导图' : '导出导图图片 (.png)'}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">生成隐藏编辑态标记的干净导图图片</div>
                </div>
                <FileImage size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
              </button>
              <button
                onClick={() => handleMindMapExport('pdf')}
                disabled={mindMapExportController.current.status === 'exporting'}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-amber-50/80 dark:bg-amber-900/20 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/40 hover:border-amber-200 dark:hover:border-amber-700/50 transition-all shadow-sm group disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div>
                  <div className="text-[13px] font-semibold tracking-wide">
                    {mindMapExportController.current.status === 'exporting' ? '正在导出导图' : '导出导图 PDF (.pdf)'}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">将当前导图范围保存为可分享的 PDF</div>
                </div>
                <FileText size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
              </button>
            </>
          )}
        </div>
      </Dialog>

      {/* Toast alert system container */}
      <ToastContainer />
    </div>
  )
}
export default App
