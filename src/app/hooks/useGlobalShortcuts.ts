import React from 'react'
import { toast } from '../../components/common/Toast'
import { useDocumentStore } from '../../features/document/documentStore'
import { useSettingsStore } from '../../features/settings/settingsStore'
import { findGlobalShortcut } from '../keyboardShortcuts'

interface GlobalShortcutOptions {
  onToggleSearch: () => void
  onToggleCommand: () => void
}

export function useGlobalShortcuts({ onToggleSearch, onToggleCommand }: GlobalShortcutOptions) {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)
  const canDiscardCurrentDoc = useDocumentStore((s) => s.canDiscardCurrentDoc)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const newDoc = useDocumentStore((s) => s.newDoc)
  const saveDoc = useDocumentStore((s) => s.saveDoc)
  const setViewMode = useDocumentStore((s) => s.setViewMode)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const shortcut = findGlobalShortcut(event)
      if (!shortcut) return

      event.preventDefault()
      switch (shortcut) {
        case 'save':
          void saveDoc().then((success) => {
            if (success) toast.success('已自动缝合保存至本地')
          })
          break
        case 'undoRedo':
          if (event.shiftKey) {
            redo()
          } else {
            undo()
          }
          break
        case 'search':
          onToggleSearch()
          break
        case 'command':
          onToggleCommand()
          break
        case 'focusMode':
          void updateSettings({ focusMode: !useSettingsStore.getState().settings.focusMode }).catch((error) => {
            toast.error(`专注模式切换失败: ${String(error)}`)
          })
          break
        case 'newDoc':
          if (canDiscardCurrentDoc()) {
            setViewMode(useSettingsStore.getState().settings.defaultViewMode)
            void newDoc().then(() => toast.success('已新建文档'))
          }
          break
        case 'outlineView':
          setViewMode('outline')
          break
        case 'mindmapView':
          setViewMode('mindmap')
          break
        case 'splitView':
          setViewMode('split')
          break
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [
    canDiscardCurrentDoc,
    currentDoc,
    currentFilePath,
    newDoc,
    onToggleCommand,
    onToggleSearch,
    redo,
    saveDoc,
    setViewMode,
    undo,
    updateSettings,
  ])
}
