import {
  indentSelectedNodes,
  moveSelectedNodes,
  outdentSelectedNodes,
} from '../../../utils/outlineBatchOperations'
import {
  findPath,
  indentNodeAtPath,
  moveNodeDownAtPath,
  moveNodeToParentIndexAtPath,
  moveNodeToSiblingIndexAtPath,
  moveNodeUpAtPath,
  outdentNodeAtPath,
} from '../../../utils/tree'
import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'

type TreeMoveActions = Pick<
  DocumentState,
  | 'indentNode'
  | 'outdentNode'
  | 'moveNode'
  | 'moveSelectedOutlineNodes'
  | 'indentSelectedOutlineNodes'
  | 'outdentSelectedOutlineNodes'
  | 'moveNodeToSibling'
  | 'moveNodeToParent'
>

export function createTreeMoveSlice(context: DocumentStoreContext): TreeMoveActions {
  const { get, set, beginMutation, setHistoryAfterMutation } = context

  return {
    indentNode: (nodeId) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = indentNodeAtPath(currentDoc.root, path)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    outdentNode: (nodeId) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = outdentNodeAtPath(currentDoc.root, path)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    moveNode: (nodeId, direction) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const newRoot = direction === 'up'
        ? moveNodeUpAtPath(currentDoc.root, path)
        : moveNodeDownAtPath(currentDoc.root, path)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    moveNodeToSibling: (sourceNodeId, targetNodeId) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before || sourceNodeId === targetNodeId) return

      const sourcePath = findPath(currentDoc.root, sourceNodeId)
      const targetPath = findPath(currentDoc.root, targetNodeId)
      if (!sourcePath || !targetPath) return

      const newRoot = moveNodeToSiblingIndexAtPath(currentDoc.root, sourcePath, targetPath)
      if (newRoot === currentDoc.root) return

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        selectedNodeId: sourceNodeId,
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },

    moveSelectedOutlineNodes: (nodeIds, direction) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before || nodeIds.length === 0) return false

      const result = moveSelectedNodes(currentDoc.root, nodeIds, direction)
      if (!result.changed) return false

      set({
        currentDoc: { ...currentDoc, root: result.root, updatedAt: Date.now() },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
      return true
    },

    indentSelectedOutlineNodes: (nodeIds) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before || nodeIds.length === 0) return false

      const result = indentSelectedNodes(currentDoc.root, nodeIds)
      if (!result.changed) return false

      set({
        currentDoc: { ...currentDoc, root: result.root, updatedAt: Date.now() },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
      return true
    },

    outdentSelectedOutlineNodes: (nodeIds) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before || nodeIds.length === 0) return false

      const result = outdentSelectedNodes(currentDoc.root, nodeIds)
      if (!result.changed) return false

      set({
        currentDoc: { ...currentDoc, root: result.root, updatedAt: Date.now() },
        isDirty: true,
      })
      setHistoryAfterMutation(before)
      return true
    },

    moveNodeToParent: (sourceNodeId, targetParentNodeId, targetIndex) => {
      const before = beginMutation()
      const { currentDoc, collapsedNodeIds } = get()
      if (!currentDoc || !before || sourceNodeId === targetParentNodeId) return

      const sourcePath = findPath(currentDoc.root, sourceNodeId)
      const targetParentPath = findPath(currentDoc.root, targetParentNodeId)
      if (!sourcePath || !targetParentPath) return

      const newRoot = moveNodeToParentIndexAtPath(currentDoc.root, sourcePath, targetParentPath, targetIndex)
      if (newRoot === currentDoc.root) return

      const newCollapsedIds = new Set(collapsedNodeIds)
      newCollapsedIds.delete(targetParentNodeId)

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        collapsedNodeIds: newCollapsedIds,
        selectedNodeId: sourceNodeId,
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },
  }
}
