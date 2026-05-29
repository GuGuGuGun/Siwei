import React from 'react'
import type { OutlineNode } from '../../types/document'
import { clampSearchIndex, searchOutlineNodes } from './mindMapSelectors'

interface UseMindMapSearchOptions {
  root: OutlineNode | null
  visibleNodeIds: Set<string>
}

export function useMindMapSearch({ root, visibleNodeIds }: UseMindMapSearchOptions) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1)

  const matchedNodeIds = React.useMemo(() => {
    if (!root) return []
    return searchOutlineNodes(root, searchQuery, visibleNodeIds)
  }, [root, searchQuery, visibleNodeIds])

  const activeMatchNodeId = matchedNodeIds[activeMatchIndex] ?? null

  React.useEffect(() => {
    setActiveMatchIndex((index) => clampSearchIndex(index, matchedNodeIds.length))
  }, [matchedNodeIds.length])

  const handleSearchQueryChange = React.useCallback((query: string) => {
    setSearchQuery(query)
    setActiveMatchIndex(query.trim() ? 0 : -1)
  }, [])

  const navigateSearch = React.useCallback((delta: number) => {
    setActiveMatchIndex((index) => clampSearchIndex(index + delta, matchedNodeIds.length))
  }, [matchedNodeIds.length])

  const closeSearch = React.useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveMatchIndex(-1)
  }, [])

  return {
    searchOpen,
    searchQuery,
    activeMatchIndex,
    matchedNodeIds,
    activeMatchNodeId,
    setSearchOpen,
    handleSearchQueryChange,
    navigateSearch,
    closeSearch,
  }
}
