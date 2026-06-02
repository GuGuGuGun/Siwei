import type { OutlineNode } from '../../../types/document'
import {
  findPath,
  updateNodeAtPath,
} from '../../../utils/tree'
import { createSnapshot } from '../documentStoreHelpers'
import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'

type TreeTextActions = Pick<DocumentState, 'updateNodeText' | 'toggleCollapse'>

export function createTreeTextSlice(context: DocumentStoreContext): TreeTextActions {
  const { get, set, beginMutation, setHistoryAfterMutation } = context

  return {
    updateNodeText: (nodeId, text) => {
      const { currentDoc } = get()
      if (!currentDoc) return
      const activeSession = get().activeTextEditSession
      const shouldRecordImmediately = activeSession?.nodeId !== nodeId
      const before = shouldRecordImmediately ? beginMutation() : null

      const now = Date.now()

      if (currentDoc.root.id === nodeId) {
        if (currentDoc.root.text === text && currentDoc.title === text) return

        const updatedDoc = {
          ...currentDoc,
          title: text,
          updatedAt: now,
          root: {
            ...currentDoc.root,
            text,
            updatedAt: now,
          },
        }
        set((state) => ({
          currentDoc: updatedDoc,
          isDirty: state.cleanSnapshotKey === null
            ? true
            : createSnapshot(updatedDoc, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey,
          activeTextEditSession: state.activeTextEditSession?.nodeId === nodeId
            ? { ...state.activeTextEditSession, didChange: true }
            : state.activeTextEditSession,
          canUndo: state.activeTextEditSession?.nodeId === nodeId ? true : state.canUndo,
          canRedo: state.activeTextEditSession?.nodeId === nodeId ? false : state.canRedo,
        }))
        if (before) setHistoryAfterMutation(before)
        return
      }

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      let currentNode: OutlineNode = currentDoc.root
      for (const idx of path) {
        currentNode = currentNode.children[idx]
      }
      if (currentNode.text === text) return

      const newRoot = updateNodeAtPath(currentDoc.root, path, (node) => ({
        ...node,
        text,
        updatedAt: now,
      }))

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
        activeTextEditSession: state.activeTextEditSession?.nodeId === nodeId
          ? { ...state.activeTextEditSession, didChange: true }
          : state.activeTextEditSession,
        canUndo: state.activeTextEditSession?.nodeId === nodeId ? true : state.canUndo,
        canRedo: state.activeTextEditSession?.nodeId === nodeId ? false : state.canRedo,
      }))
      if (before) setHistoryAfterMutation(before)
    },

    toggleCollapse: (nodeId) => {
      const before = beginMutation()
      if (!before) return

      set((state) => {
        const newCollapsed = new Set(state.collapsedNodeIds)
        if (newCollapsed.has(nodeId)) {
          newCollapsed.delete(nodeId)
        } else {
          newCollapsed.add(nodeId)
        }
        return {
          collapsedNodeIds: newCollapsed,
          isDirty: true,
        }
      })
      setHistoryAfterMutation(before)
    },
  }
}
