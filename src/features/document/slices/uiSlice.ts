import { findNodePath, normalizeTag } from '../../filter/filterUtils'
import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'

type UiActions = Pick<
  DocumentState,
  | 'setViewMode'
  | 'selectNode'
  | 'setOutlineSelection'
  | 'clearOutlineSelection'
  | 'setFilterQuery'
  | 'setFilterTag'
  | 'setFilterChecked'
  | 'clearFilters'
  | 'focusNode'
>

export function createUiSlice(context: DocumentStoreContext): UiActions {
  const { get, set } = context

  return {
    setViewMode: (viewMode) => set({ viewMode }),

    selectNode: (selectedNodeId) => set({
      selectedNodeId,
      outlineSelection: selectedNodeId
        ? { anchorNodeId: selectedNodeId, selectedNodeIds: [selectedNodeId] }
        : { anchorNodeId: null, selectedNodeIds: [] },
    }),

    setOutlineSelection: (outlineSelection) => set({
      outlineSelection,
      selectedNodeId: outlineSelection.selectedNodeIds[outlineSelection.selectedNodeIds.length - 1] ?? null,
    }),

    clearOutlineSelection: () => set({
      outlineSelection: { anchorNodeId: null, selectedNodeIds: [] },
    }),

    setFilterQuery: (query) => {
      set((state) => ({
        filter: {
          ...state.filter,
          query,
        },
      }))
    },

    setFilterTag: (tag) => {
      set((state) => ({
        filter: {
          ...state.filter,
          tag: tag ? normalizeTag(tag) : null,
        },
      }))
    },

    setFilterChecked: (checked) => {
      set((state) => ({
        filter: {
          ...state.filter,
          checked,
        },
      }))
    },

    clearFilters: () => set({ filter: { query: '', tag: null, checked: 'all' } }),

    focusNode: (nodeId) => {
      const { currentDoc, collapsedNodeIds } = get()
      if (!currentDoc) return

      const nodePath = findNodePath(currentDoc.root, nodeId)
      if (!nodePath) return

      const newCollapsed = new Set(collapsedNodeIds)
      nodePath.slice(1, -1).forEach((node) => newCollapsed.delete(node.id))

      set({
        collapsedNodeIds: newCollapsed,
        selectedNodeId: nodeId,
        focusedNodeId: nodeId,
        focusRequestSeq: get().focusRequestSeq + 1,
      })

      window.setTimeout(() => {
        if (get().focusedNodeId === nodeId) {
          set({ focusedNodeId: null })
        }
      }, 1600)
    },
  }
}
