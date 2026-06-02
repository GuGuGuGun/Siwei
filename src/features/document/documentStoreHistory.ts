import type { StoreApi } from 'zustand'

import type { DocumentState, HistorySnapshot } from './documentStoreTypes'
import { cloneDocument, createSnapshot } from './documentStoreHelpers'

type StoreSet = StoreApi<DocumentState>['setState']
type StoreGet = StoreApi<DocumentState>['getState']

export interface DocumentHistoryController {
  getCurrentSnapshot: () => HistorySnapshot | null
  clearHistoryState: (
    doc: HistorySnapshot['currentDoc'],
    selectedNodeId: string | null,
    collapsedNodeIds: Set<string>,
    options: { isDirty: boolean },
  ) => Pick<DocumentState, 'undoStack' | 'redoStack' | 'canUndo' | 'canRedo' | 'activeTextEditSession' | 'cleanSnapshotKey'>
  beginMutation: () => HistorySnapshot | null
  setHistoryAfterMutation: (before: HistorySnapshot) => void
  finalizeActiveTextEditSession: () => void
  restoreSnapshot: (
    snapshot: HistorySnapshot,
    undoStack: HistorySnapshot[],
    redoStack: HistorySnapshot[],
  ) => void
}

export function createDocumentHistoryController(set: StoreSet, get: StoreGet): DocumentHistoryController {
  const getCurrentSnapshot = (): HistorySnapshot | null => {
    const { currentDoc, selectedNodeId, collapsedNodeIds } = get()
    if (!currentDoc) return null

    return createSnapshot(currentDoc, selectedNodeId, collapsedNodeIds)
  }

  const restoreSnapshot = (
    snapshot: HistorySnapshot,
    undoStack: HistorySnapshot[],
    redoStack: HistorySnapshot[],
  ) => {
    const { cleanSnapshotKey } = get()
    set({
      currentDoc: cloneDocument(snapshot.currentDoc),
      selectedNodeId: snapshot.selectedNodeId,
      collapsedNodeIds: new Set(snapshot.collapsedNodeIds),
      undoStack,
      redoStack,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      activeTextEditSession: null,
      isDirty: cleanSnapshotKey === null ? true : snapshot.key !== cleanSnapshotKey,
    })
  }

  const setHistoryAfterMutation = (before: HistorySnapshot) => {
    const after = getCurrentSnapshot()
    if (!after || after.key === before.key) return

    set((state) => ({
      undoStack: [...state.undoStack, before],
      redoStack: [],
      canUndo: true,
      canRedo: false,
      isDirty: state.cleanSnapshotKey === null ? true : after.key !== state.cleanSnapshotKey,
    }))
  }

  const clearHistoryState: DocumentHistoryController['clearHistoryState'] = (
    doc,
    selectedNodeId,
    collapsedNodeIds,
    options,
  ) => {
    const snapshot = createSnapshot(doc, selectedNodeId, collapsedNodeIds)

    return {
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      activeTextEditSession: null,
      cleanSnapshotKey: options.isDirty ? null : snapshot.key,
    }
  }

  const finalizeActiveTextEditSession = () => {
    const session = get().activeTextEditSession
    if (!session) return

    const after = getCurrentSnapshot()
    if (!after || !session.didChange || after.key === session.before.key) {
      set((state) => ({
        activeTextEditSession: null,
        canUndo: state.undoStack.length > 0,
      }))
      return
    }

    set((state) => ({
      undoStack: [...state.undoStack, session.before],
      redoStack: [],
      activeTextEditSession: null,
      canUndo: true,
      canRedo: false,
      isDirty: state.cleanSnapshotKey === null ? true : after.key !== state.cleanSnapshotKey,
    }))
  }

  const beginMutation = (): HistorySnapshot | null => {
    finalizeActiveTextEditSession()
    return getCurrentSnapshot()
  }

  return {
    getCurrentSnapshot,
    clearHistoryState,
    beginMutation,
    setHistoryAfterMutation,
    finalizeActiveTextEditSession,
    restoreSnapshot,
  }
}
