import React from 'react'
import { useDocumentStore } from '../../features/document/documentStore'
import { useSettingsStore } from '../../features/settings/settingsStore'

export function useAutoSave() {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const isDirty = useDocumentStore((s) => s.isDirty)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)
  const saveDoc = useDocumentStore((s) => s.saveDoc)
  const autoSaveEnabled = useSettingsStore((s) => s.settings.autoSaveEnabled)
  const autoSaveIntervalMs = useSettingsStore((s) => s.settings.autoSaveIntervalMs)

  React.useEffect(() => {
    if (!autoSaveEnabled) return
    if (!currentDoc || !isDirty || !currentFilePath) return

    const timer = window.setTimeout(() => {
      void saveDoc()
    }, autoSaveIntervalMs)

    return () => window.clearTimeout(timer)
  }, [autoSaveEnabled, autoSaveIntervalMs, currentDoc, currentFilePath, isDirty, saveDoc])
}
