import React from 'react'
import type { OutlineDocument } from '../../types/document'
import { findNodeById } from './mindMapActions'
import { getParentIdMap } from './mindMapSelectors'

interface UseMindMapFocusOptions {
  currentDoc: OutlineDocument | null
  focusRequestSeq: number
  selectedNodeId: string | null
  selectNode: (nodeId: string | null) => void
}

export function useMindMapFocus({
  currentDoc,
  focusRequestSeq,
  selectedNodeId,
  selectNode,
}: UseMindMapFocusOptions) {
  const [focusRootNodeId, setFocusRootNodeId] = React.useState<string | null>(null)

  const validFocusRootNodeId = React.useMemo(() => {
    if (!currentDoc || !focusRootNodeId || focusRootNodeId === currentDoc.root.id) return null
    return findNodeById(currentDoc.root, focusRootNodeId) ? focusRootNodeId : null
  }, [currentDoc, focusRootNodeId])

  React.useEffect(() => {
    setFocusRootNodeId(null)
  }, [focusRequestSeq])

  React.useEffect(() => {
    if (!currentDoc || !validFocusRootNodeId || !selectedNodeId) return
    if (findNodeById(currentDoc.root, validFocusRootNodeId)) return

    const selectedNode = findNodeById(currentDoc.root, selectedNodeId)
    setFocusRootNodeId(selectedNode ? selectedNodeId : null)
  }, [currentDoc, selectedNodeId, validFocusRootNodeId])

  const handleFocusBranch = React.useCallback((nodeId: string) => {
    if (!currentDoc) return
    setFocusRootNodeId(nodeId === currentDoc.root.id ? null : nodeId)
    selectNode(nodeId)
  }, [currentDoc, selectNode])

  const handleResetFocus = React.useCallback(() => {
    setFocusRootNodeId(null)
  }, [])

  const handleAfterDeleteFocus = React.useCallback((deletedNodeId: string) => {
    if (!currentDoc || validFocusRootNodeId !== deletedNodeId) return

    const parentNodeId = getParentIdMap(currentDoc.root).get(deletedNodeId) ?? null
    if (!parentNodeId || parentNodeId === currentDoc.root.id) {
      setFocusRootNodeId(null)
      return
    }

    setFocusRootNodeId(parentNodeId)
    selectNode(parentNodeId)
  }, [currentDoc, selectNode, validFocusRootNodeId])

  return {
    validFocusRootNodeId,
    handleFocusBranch,
    handleResetFocus,
    handleAfterDeleteFocus,
  }
}
