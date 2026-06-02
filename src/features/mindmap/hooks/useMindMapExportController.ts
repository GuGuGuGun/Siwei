import React from 'react'
import type { Node } from 'reactflow'

import { isAgentInsertionNodeId } from '../agentInsertionPreviewBuilder'
import type { MindMapNodeData } from '../MindMapNode'
import { useMindMapExport } from '../useMindMapExport'
import { useMindMapExportRegistration } from '../useMindMapExportRegistration'

interface MindMapExportControllerOptions {
  documentTitle: string
  nodes: Node<MindMapNodeData>[]
  flowWrapperRef: React.RefObject<HTMLDivElement>
}

export function useMindMapExportController({
  documentTitle,
  nodes,
  flowWrapperRef,
}: MindMapExportControllerOptions) {
  const [exportClean, setExportClean] = React.useState(false)
  const cleanExportElement = React.useCallback(() => flowWrapperRef.current, [flowWrapperRef])
  const { status: exportStatus, exportMindMap } = useMindMapExport({
    documentTitle,
    getExportElement: cleanExportElement,
    hasExportableContent: () => nodes.some((node) => !isAgentInsertionNodeId(node.id)),
  })

  const handleExport = React.useCallback(async (format: 'png' | 'pdf') => {
    setExportClean(true)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    await exportMindMap(format)
    setExportClean(false)
  }, [exportMindMap])

  useMindMapExportRegistration({
    active: true,
    status: exportStatus,
    exportMindMap: (format) => void handleExport(format),
  })

  return { exportClean }
}
