import React from 'react'
import type { OutlineDocument } from '../../../types/document'
import {
  getChildIndexMap,
  getDescendantIds,
  getNodeDepthMap,
  getNodeSubtree,
  getParentIdMap,
  getVisibleMindMapNodeIds,
} from '../mindMapSelectors'

interface MindMapGraphSelectorOptions {
  currentDoc: OutlineDocument | null
  collapsedNodeIds: Set<string>
  validFocusRootNodeId: string | null
}

export function useMindMapGraphSelectors({
  currentDoc,
  collapsedNodeIds,
  validFocusRootNodeId,
}: MindMapGraphSelectorOptions) {
  const depthByNodeId = React.useMemo(
    () => currentDoc ? getNodeDepthMap(currentDoc.root) : new Map<string, number>(),
    [currentDoc],
  )

  const parentByNodeId = React.useMemo(
    () => currentDoc ? getParentIdMap(currentDoc.root) : new Map<string, string | null>(),
    [currentDoc],
  )

  const childIndexByNodeId = React.useMemo(
    () => currentDoc ? getChildIndexMap(currentDoc.root) : new Map<string, number>(),
    [currentDoc],
  )

  const getNodeDescendantIds = React.useCallback((nodeId: string): Set<string> => {
    return currentDoc ? getDescendantIds(currentDoc.root, nodeId) : new Set<string>()
  }, [currentDoc])

  const visibleNodeIds = React.useMemo(() => {
    if (!currentDoc) return new Set<string>()
    return new Set(getVisibleMindMapNodeIds(currentDoc.root, collapsedNodeIds, validFocusRootNodeId))
  }, [collapsedNodeIds, currentDoc, validFocusRootNodeId])

  const graphRootNode = React.useMemo(() => {
    if (!currentDoc) return null
    return validFocusRootNodeId
      ? getNodeSubtree(currentDoc.root, validFocusRootNodeId)
      : currentDoc.root
  }, [currentDoc, validFocusRootNodeId])

  return {
    depthByNodeId,
    parentByNodeId,
    childIndexByNodeId,
    getNodeDescendantIds,
    visibleNodeIds,
    graphRootNode,
  }
}
