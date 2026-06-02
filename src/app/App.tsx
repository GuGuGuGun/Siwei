import React from 'react'
import { LogOut } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { Sidebar } from '../components/layout/Sidebar'
import { StatusBar } from '../components/layout/StatusBar'
import { ToastContainer, toast } from '../components/common/Toast'
import { CommandPalette } from '../components/common/CommandPalette'
import { AgentPanel } from '../features/agent/AgentPanel'
import { useAgentStore } from '../features/agent/agentStore'
import { useDocumentStore } from '../features/document/documentStore'
import { LibraryWorkspace } from '../features/library/LibraryWorkspace'
import { mindMapExportController } from '../features/mindmap/mindMapExportController'
import { MindMapView } from '../features/mindmap/MindMapView'
import { OutlineEditor } from '../features/outline/OutlineEditor'
import { SearchPanel } from '../features/search/SearchPanel'
import { SettingsPage } from '../features/settings/SettingsPage'
import { useSettingsStore } from '../features/settings/settingsStore'
import { openFileDialog, saveFileDialog } from '../services/siweiApi'
import { useAsyncOperation } from '../hooks/useAsyncOperation'
import { AppHeader } from './components/AppHeader'
import { ExportDialog, ImportDialog } from './components/DocumentDialogs'
import { ViewSwitcher } from './components/ViewSwitcher'
import { useAppInitialization } from './hooks/useAppInitialization'
import { useAutoSave } from './hooks/useAutoSave'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useSuppressBrowserContextMenu } from './hooks/useSuppressBrowserContextMenu'
import { useThemeManager } from './hooks/useThemeManager'
import { useWorkspaceStore } from './workspaceStore'

export const App: React.FC = () => {
  useAppInitialization()
  useAutoSave()
  useThemeManager()
  useSuppressBrowserContextMenu()

  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const viewMode = useDocumentStore((s) => s.viewMode)
  const canUndo = useDocumentStore((s) => s.canUndo)
  const canRedo = useDocumentStore((s) => s.canRedo)
  const saveDoc = useDocumentStore((s) => s.saveDoc)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const exportDoc = useDocumentStore((s) => s.exportDoc)
  const importDoc = useDocumentStore((s) => s.importDoc)
  const newDoc = useDocumentStore((s) => s.newDoc)
  const canDiscardCurrentDoc = useDocumentStore((s) => s.canDiscardCurrentDoc)
  const setViewMode = useDocumentStore((s) => s.setViewMode)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const activeWorkspaceView = useWorkspaceStore((s) => s.activeView)
  const isAgentOpen = useAgentStore((s) => s.isOpen)
  const setAgentOpen = useAgentStore((s) => s.setOpen)

  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const [isImportOpen, setIsImportOpen] = React.useState(false)
  const [isExportOpen, setIsExportOpen] = React.useState(false)
  const [isCommandOpen, setIsCommandOpen] = React.useState(false)
  const runImport = useAsyncOperation({ errorPrefix: '导入失败' })
  const runExport = useAsyncOperation({ errorPrefix: '导出失败' })
  const runFocusMode = useAsyncOperation({ errorPrefix: '退出专注模式失败' })

  useGlobalShortcuts({
    onToggleSearch: React.useCallback(() => setIsSearchOpen((prev) => !prev), []),
    onToggleCommand: React.useCallback(() => setIsCommandOpen((prev) => !prev), []),
  })

  const isMindMapVisible = activeWorkspaceView === 'editor' && (viewMode === 'mindmap' || viewMode === 'split')

  const handleImport = async (format: 'json' | 'markdown') => {
    if (!canDiscardCurrentDoc()) return

    await runImport(async () => {
      const filters = format === 'markdown' ? ['md', 'markdown'] : ['siwei.json', 'json']
      const path = await openFileDialog(filters)
      if (!path) return

      await importDoc(path, format)
      toast.success(`成功缝合导入 ${format === 'markdown' ? 'Markdown' : 'JSON'} 大纲`)
      setIsImportOpen(false)
    })
  }

  const handleExport = async (format: 'json' | 'markdown') => {
    if (!currentDoc) return

    await runExport(async () => {
      const defaultName = `${currentDoc.title || '未命名织物'}.${format === 'markdown' ? 'md' : 'siwei.json'}`
      const path = await saveFileDialog(defaultName)
      if (!path) return

      await exportDoc(path, format)
      toast.success(`成功导出 ${format === 'markdown' ? 'Markdown' : 'JSON'} 贴布文件`)
      setIsExportOpen(false)
    })
  }

  const handleMindMapExport = (format: 'png' | 'pdf') => {
    mindMapExportController.current.exportMindMap?.(format)
    setIsExportOpen(false)
  }

  const handleNewDoc = () => {
    if (!canDiscardCurrentDoc()) return

    setViewMode(useSettingsStore.getState().settings.defaultViewMode)
    void newDoc().then(() => toast.success('已新建文档'))
  }

  const exitFocusMode = () => {
    void runFocusMode(() => updateSettings({ focusMode: false }))
  }

  return (
    <div className="flex h-screen w-screen select-none overflow-hidden bg-linen font-sans text-zinc-800 dark:text-zinc-200">
      {!settings.focusMode && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-linen dark:bg-zinc-950">
        {!settings.focusMode && (
          <AppHeader
            viewMode={viewMode}
            canUndo={canUndo}
            canRedo={canRedo}
            isAgentOpen={isAgentOpen}
            onViewModeChange={setViewMode}
            onUndo={undo}
            onRedo={redo}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenCommand={() => setIsCommandOpen(true)}
            onToggleAgent={() => setAgentOpen(!isAgentOpen)}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenExport={() => setIsExportOpen(true)}
            onSave={saveDoc}
          />
        )}

        <main className="relative flex-1 overflow-hidden bg-linen dark:bg-zinc-950">
          <div className="flex h-full w-full overflow-hidden">
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {activeWorkspaceView === 'library' ? (
                  <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 h-full w-full">
                    <LibraryWorkspace />
                  </motion.div>
                ) : activeWorkspaceView === 'settings' ? (
                  <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 h-full w-full">
                    <SettingsPage />
                  </motion.div>
                ) : (
                  <motion.div key={viewMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 h-full w-full bg-linen dark:bg-zinc-950">
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
        {!settings.focusMode && <StatusBar />}
      </div>

      <SearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onNewDoc={handleNewDoc}
        onImport={() => setIsImportOpen(true)}
        onExport={() => setIsExportOpen(true)}
      />

      {settings.focusMode && (
        <>
          <div className="fixed left-1/2 top-3 z-40 -translate-x-1/2">
            <ViewSwitcher viewMode={viewMode} onViewModeChange={setViewMode} />
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

      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
      />
      <ExportDialog
        isOpen={isExportOpen}
        isMindMapVisible={isMindMapVisible}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExport}
        onMindMapExport={handleMindMapExport}
      />

      <ToastContainer />
    </div>
  )
}

export default App
