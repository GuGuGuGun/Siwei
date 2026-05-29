import React from 'react'
import type { MindMapExportFormat } from './MindMapExportMenu'
import { mindMapExportController, type MindMapExportStatus } from './mindMapExportController'

interface UseMindMapExportRegistrationOptions {
  active: boolean
  status: MindMapExportStatus
  exportMindMap: (format: MindMapExportFormat) => void
}

export function useMindMapExportRegistration({
  active,
  status,
  exportMindMap,
}: UseMindMapExportRegistrationOptions) {
  React.useEffect(() => {
    if (!active) return

    mindMapExportController.current = {
      status,
      exportMindMap,
    }

    return () => {
      if (mindMapExportController.current.exportMindMap === exportMindMap) {
        mindMapExportController.current = {
          status: 'unavailable',
          exportMindMap: null,
        }
      }
    }
  }, [active, exportMindMap, status])
}
