import React from 'react'
import { toast } from '../../components/common/Toast'
import { useDocumentStore } from '../../features/document/documentStore'
import { useSettingsStore } from '../../features/settings/settingsStore'

export function useAppInitialization() {
  const newDoc = useDocumentStore((s) => s.newDoc)
  const setViewMode = useDocumentStore((s) => s.setViewMode)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const didInitializeRef = React.useRef(false)

  React.useEffect(() => {
    if (didInitializeRef.current) return
    didInitializeRef.current = true

    void newDoc()
    void loadSettings()
      .then(() => {
        const defaultViewMode = useSettingsStore.getState().settings.defaultViewMode
        setViewMode(defaultViewMode)
      })
      .catch((error) => {
        toast.error(`加载设置失败: ${String(error)}`)
      })
  }, [loadSettings, newDoc, setViewMode])
}
