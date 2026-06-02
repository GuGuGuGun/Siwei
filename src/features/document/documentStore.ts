import { create } from 'zustand'
import { OutlineNode } from '../../types/document'
import {
  findPath,
  updateNodeAtPath,
} from '../../utils/tree'
import {
  createSnapshot,
} from './documentStoreHelpers'
import { createDocumentHistoryController } from './documentStoreHistory'
import { createDirtyStateSelector } from './documentStoreContext'
import { createAgentIntegrationSlice } from './agentIntegration'
import { createNodeMetadataSlice } from './slices/nodeMetadataSlice'
import { createPersistenceSlice } from './slices/persistenceSlice'
import { createUiSlice } from './slices/uiSlice'
import { createHistorySlice } from './slices/historySlice'
import { createTreeSlice } from './slices/treeSlice'
import type { DocumentState } from './documentStoreTypes'
export type {
  DocumentState,
  NodeOperationState,
  OutlineSelectionState,
  SaveStatus,
  ViewMode,
} from './documentStoreTypes'

export const useDocumentStore = create<DocumentState>((set, get) => {
  const {
    getCurrentSnapshot,
    clearHistoryState,
    beginMutation,
    setHistoryAfterMutation,
    finalizeActiveTextEditSession,
    restoreSnapshot,
  } = createDocumentHistoryController(set, get)
  const markDocumentDirty = createDirtyStateSelector(get)

  const mutateNodeProperty = (
    nodeId: string,
    updater: (node: OutlineNode, now: number) => OutlineNode,
  ) => {
    const before = beginMutation()
    const { currentDoc } = get()
    if (!currentDoc || !before) return

    const path = findPath(currentDoc.root, nodeId)
    if (!path) return

    const now = Date.now()
    const newRoot = updateNodeAtPath(currentDoc.root, path, (node) => updater(node, now))
    if (newRoot === currentDoc.root) return

    const updatedDoc = {
      ...currentDoc,
      root: newRoot,
      updatedAt: now,
    }

    set((state) => ({
      currentDoc: updatedDoc,
      isDirty: state.cleanSnapshotKey === null
        ? true
        : createSnapshot(updatedDoc, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey,
    }))
    setHistoryAfterMutation(before)
  }
  const storeContext = {
    set,
    get,
    getCurrentSnapshot,
    clearHistoryState,
    beginMutation,
    setHistoryAfterMutation,
    finalizeActiveTextEditSession,
    restoreSnapshot,
    mutateNodeProperty,
    markDocumentDirty,
  }

  return {
    currentDoc: null,
    viewMode: 'outline',
    selectedNodeId: null,
    collapsedNodeIds: new Set<string>(),
    isDirty: false,
    saveStatus: 'idle',
    currentFilePath: null,
    filter: { query: '', tag: null, checked: 'all' },
    focusedNodeId: null,
    focusRequestSeq: 0,
    canUndo: false,
    canRedo: false,
    undoStack: [],
    redoStack: [],
    cleanSnapshotKey: null,
    activeTextEditSession: null,
    outlineSelection: { anchorNodeId: null, selectedNodeIds: [] },

    ...createPersistenceSlice(storeContext),

    ...createUiSlice(storeContext),

    ...createTreeSlice(storeContext),

    ...createNodeMetadataSlice(storeContext),

    ...createAgentIntegrationSlice(storeContext),

    ...createHistorySlice(storeContext),
  }
})
