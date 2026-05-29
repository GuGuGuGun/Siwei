import type { MindMapExportFormat } from './MindMapExportMenu'

export type MindMapExportStatus = 'idle' | 'exporting' | 'unavailable'

interface MindMapExportController {
  current: {
    status: MindMapExportStatus
    exportMindMap: ((format: MindMapExportFormat) => void) | null
  }
}

export const mindMapExportController: MindMapExportController = {
  current: {
    status: 'unavailable',
    exportMindMap: null,
  },
}
