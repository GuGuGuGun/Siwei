import type { OutlineNode } from '../../../types/document'
import {
  deleteNodeAtPath,
  findPath,
  getVisibleNodes,
  insertChildAtPath,
  insertSiblingAtPath,
  updateNodeAtPath,
} from '../../../utils/tree'
import { createOutlineNode } from '../documentStoreHelpers'
import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState } from '../documentStoreTypes'

type TreeInsertDeleteActions = Pick<
  DocumentState,
  | 'insertNode'
  | 'insertSiblingNode'
  | 'insertChildNode'
  | 'deleteNode'
>

export function createTreeInsertDeleteSlice(context: DocumentStoreContext): TreeInsertDeleteActions {
  const { get, set, beginMutation, setHistoryAfterMutation } = context

  return {
    insertNode: (nodeId, text = '') => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return null

      const now = Date.now()
      const newNode = createOutlineNode(text)

      if (currentDoc.root.id === nodeId) {
        set({
          currentDoc: {
            ...currentDoc,
            root: {
              ...currentDoc.root,
              children: [...currentDoc.root.children, newNode],
            },
            updatedAt: now,
          },
          selectedNodeId: newNode.id,
          isDirty: true,
        })
        setHistoryAfterMutation(before)
        return newNode.id
      }

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return null

      let node: OutlineNode = currentDoc.root
      for (const idx of path) {
        node = node.children[idx]
      }

      const isCollapsed = get().collapsedNodeIds.has(nodeId)
      if (node.children.length > 0 && !isCollapsed) {
        const newRoot = updateNodeAtPath(currentDoc.root, path, (parent) => ({
          ...parent,
          children: [newNode, ...parent.children],
        }))
        set({
          currentDoc: { ...currentDoc, root: newRoot, updatedAt: now },
          selectedNodeId: newNode.id,
          isDirty: true,
        })
        setHistoryAfterMutation(before)
        return newNode.id
      }

      const newRoot = insertSiblingAtPath(currentDoc.root, path, newNode)
      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: now },
        selectedNodeId: newNode.id,
        isDirty: true,
      })
      setHistoryAfterMutation(before)
      return newNode.id
    },

    insertSiblingNode: (nodeId, text = '') => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before || currentDoc.root.id === nodeId) return null

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return null

      const newNode = createOutlineNode(text)
      const newRoot = insertSiblingAtPath(currentDoc.root, path, newNode)
      if (newRoot === currentDoc.root) return null

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        selectedNodeId: newNode.id,
        isDirty: true,
      })
      setHistoryAfterMutation(before)
      return newNode.id
    },

    insertChildNode: (parentNodeId, text = '') => {
      const before = beginMutation()
      const { currentDoc, collapsedNodeIds } = get()
      if (!currentDoc || !before) return null

      const path = findPath(currentDoc.root, parentNodeId)
      if (!path) return null

      const newNode = createOutlineNode(text)
      const newRoot = insertChildAtPath(currentDoc.root, path, newNode)
      const newCollapsedIds = new Set(collapsedNodeIds)
      newCollapsedIds.delete(parentNodeId)

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        collapsedNodeIds: newCollapsedIds,
        selectedNodeId: newNode.id,
        isDirty: true,
      })
      setHistoryAfterMutation(before)
      return newNode.id
    },

    deleteNode: (nodeId) => {
      const before = beginMutation()
      const { currentDoc, selectedNodeId } = get()
      if (!currentDoc || !before || currentDoc.root.id === nodeId) return

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return

      const visibleNodes = getVisibleNodes(currentDoc.root, get().collapsedNodeIds)
      const currentIndex = visibleNodes.findIndex((n) => n.node.id === nodeId)
      let nextFocusId: string | null = null

      if (visibleNodes.length > 1) {
        if (currentIndex > 0) {
          nextFocusId = visibleNodes[currentIndex - 1].node.id
        } else if (currentIndex < visibleNodes.length - 1) {
          nextFocusId = visibleNodes[currentIndex + 1].node.id
        } else {
          nextFocusId = currentDoc.root.id
        }
      } else {
        nextFocusId = currentDoc.root.id
      }

      const newRoot = deleteNodeAtPath(currentDoc.root, path)

      set({
        currentDoc: { ...currentDoc, root: newRoot, updatedAt: Date.now() },
        selectedNodeId: selectedNodeId === nodeId ? nextFocusId : selectedNodeId,
        isDirty: true,
      })
      setHistoryAfterMutation(before)
    },
  }
}
