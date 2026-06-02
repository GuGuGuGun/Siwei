import {
  findPath,
} from '../../../utils/tree'
import { normalizeMindMapLayoutState, pruneMindMapLayoutState } from '../../mindmap/mindMapLayoutState'
import {
  createSnapshot,
  getNodeAtPath,
} from '../documentStoreHelpers'
import type { DocumentStoreContext } from '../documentStoreContext'
import type { DocumentState, NodeOperationState } from '../documentStoreTypes'

type TreeLayoutActions = Pick<DocumentState, 'commitMindMapLayout' | 'getNodeOperationState'>

export function createTreeLayoutSlice(context: DocumentStoreContext): TreeLayoutActions {
  const { get, set, beginMutation, setHistoryAfterMutation } = context

  return {
    commitMindMapLayout: (layout) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return

      const normalizedLayout = normalizeMindMapLayoutState(layout)
      if (!normalizedLayout) return

      const updatedDoc = {
        ...currentDoc,
        version: Math.max(currentDoc.version, 2),
        updatedAt: Date.now(),
        mindMapLayout: pruneMindMapLayoutState(normalizedLayout, currentDoc.root),
      }

      set((state) => ({
        currentDoc: updatedDoc,
        isDirty: state.cleanSnapshotKey === null
          ? true
          : createSnapshot(updatedDoc, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey,
      }))
      setHistoryAfterMutation(before)
    },

    getNodeOperationState: (nodeId) => {
      const { currentDoc } = get()
      const disabled: NodeOperationState = {
        canInsertSibling: false,
        canInsertChild: false,
        canDelete: false,
        canIndent: false,
        canOutdent: false,
        canMoveUp: false,
        canMoveDown: false,
        canToggleCollapse: false,
      }
      if (!currentDoc) return disabled

      const path = findPath(currentDoc.root, nodeId)
      if (!path) return disabled

      const node = getNodeAtPath(currentDoc.root, path)
      if (path.length === 0) {
        return {
          canInsertSibling: false,
          canInsertChild: true,
          canDelete: false,
          canIndent: false,
          canOutdent: false,
          canMoveUp: false,
          canMoveDown: false,
          canToggleCollapse: node.children.length > 0,
        }
      }

      const parent = getNodeAtPath(currentDoc.root, path.slice(0, -1))
      const index = path[path.length - 1]

      return {
        canInsertSibling: true,
        canInsertChild: true,
        canDelete: true,
        canIndent: index > 0,
        canOutdent: path.length > 1,
        canMoveUp: index > 0,
        canMoveDown: index < parent.children.length - 1,
        canToggleCollapse: node.children.length > 0,
      }
    },
  }
}
