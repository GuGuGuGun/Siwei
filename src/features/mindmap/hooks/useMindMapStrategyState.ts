import React from 'react'
import type { MindMapLayoutStrategy, OutlineDocument } from '../../../types/document'
import {
  DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
  SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES,
} from '../mindMapLayoutState'
import { createBranchSideKey, type MindMapBranchSide } from '../branchSideCollapse'

function isSupportedMindMapLayoutStrategy(strategy: string): strategy is MindMapLayoutStrategy {
  return SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES.includes(
    strategy as typeof SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES[number],
  )
}

interface MindMapStrategyStateOptions {
  currentDoc: OutlineDocument | null
  experimentalLayoutEnabled: boolean
  setFeedback: (feedback: string | null) => void
}

export function useMindMapStrategyState({
  currentDoc,
  experimentalLayoutEnabled,
  setFeedback,
}: MindMapStrategyStateOptions) {
  const [layoutStrategy, setLayoutStrategy] = React.useState<MindMapLayoutStrategy>(DEFAULT_MIND_MAP_LAYOUT_STRATEGY)
  const restoredStrategyDocumentIdRef = React.useRef<string | null>(null)
  const [collapsedBranchSides, setCollapsedBranchSides] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!experimentalLayoutEnabled && layoutStrategy !== DEFAULT_MIND_MAP_LAYOUT_STRATEGY) {
      setLayoutStrategy(DEFAULT_MIND_MAP_LAYOUT_STRATEGY)
      setFeedback('已切换为经典布局')
    }
  }, [experimentalLayoutEnabled, layoutStrategy, setFeedback])

  React.useEffect(() => {
    const savedStrategy = currentDoc?.mindMapLayout?.strategy
    if (
      !currentDoc
      || !experimentalLayoutEnabled
      || !savedStrategy
      || savedStrategy === layoutStrategy
      || !isSupportedMindMapLayoutStrategy(savedStrategy)
      || restoredStrategyDocumentIdRef.current === currentDoc.id
    ) {
      return
    }

    restoredStrategyDocumentIdRef.current = currentDoc.id
    setLayoutStrategy(savedStrategy)
  }, [currentDoc, currentDoc?.id, currentDoc?.mindMapLayout?.strategy, experimentalLayoutEnabled, layoutStrategy])

  const handleStrategyChange = React.useCallback((strategy: MindMapLayoutStrategy) => {
    if (currentDoc) {
      restoredStrategyDocumentIdRef.current = currentDoc.id
    }
    setLayoutStrategy(strategy)
  }, [currentDoc])

  const toggleBranchSide = React.useCallback((nodeId: string, side: MindMapBranchSide) => {
    setCollapsedBranchSides((current) => {
      const key = createBranchSideKey(nodeId, side)
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  return {
    layoutStrategy,
    collapsedBranchSides,
    handleStrategyChange,
    toggleBranchSide,
  }
}
