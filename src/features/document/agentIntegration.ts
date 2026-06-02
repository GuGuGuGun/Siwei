import { generateId } from '../../utils/id'
import {
  findPath,
  updateNodeAtPath,
} from '../../utils/tree'
import { applyAgentChangePlanToDocument, createDocumentSnapshotKey } from '../agent/agentChangePlan'
import { createOutlineNodeFromAgentInput } from '../agent/agentNormalization'
import type { OutlineNode } from '../../types/document'
import { createSnapshot, getNodeAtPath } from './documentStoreHelpers'
import type { DocumentStoreContext } from './documentStoreContext'
import type { DocumentState } from './documentStoreTypes'

type AgentIntegrationActions = Pick<
  DocumentState,
  | 'applyAgentChangePlan'
  | 'insertAgentMindMapNodes'
>

export function createAgentIntegrationSlice(context: DocumentStoreContext): AgentIntegrationActions {
  const { get, set, beginMutation, setHistoryAfterMutation } = context

  return {
    applyAgentChangePlan: (plan) => {
      const before = beginMutation()
      const { currentDoc } = get()
      if (!currentDoc || !before) return { ok: false, error: '当前没有可修改的文档' }

      const result = applyAgentChangePlanToDocument(currentDoc, plan)
      if (!result.ok) return result

      set((state) => ({
        currentDoc: result.document,
        selectedNodeId: state.selectedNodeId,
        isDirty: state.cleanSnapshotKey === null
          ? true
          : createSnapshot(result.document, state.selectedNodeId, state.collapsedNodeIds).key !== state.cleanSnapshotKey,
      }))
      setHistoryAfterMutation(before)

      return { ok: true }
    },

    insertAgentMindMapNodes: (params) => {
      const before = beginMutation()
      const { currentDoc, collapsedNodeIds } = get()
      if (!currentDoc || !before) return { ok: false, error: '当前没有可修改的文档' }
      if (params.documentId !== currentDoc.id) {
        return { ok: false, error: 'Agent 工具请求不属于当前文档' }
      }
      if (params.snapshotKey !== createDocumentSnapshotKey(currentDoc)) {
        return { ok: false, error: '当前文档已变化，请让助理重新生成节点' }
      }
      if (!Array.isArray(params.nodes) || params.nodes.length === 0) {
        return { ok: false, error: 'Agent 工具请求没有包含节点' }
      }

      const parentPath = findPath(currentDoc.root, params.parentNodeId)
      if (!parentPath) return { ok: false, error: `父节点不存在: ${params.parentNodeId}` }
      const parent = getNodeAtPath(currentDoc.root, parentPath)
      const index = params.index ?? parent.children.length
      if (index < 0 || index > parent.children.length) {
        return { ok: false, error: `插入位置无效: ${params.parentNodeId}[${index}]` }
      }

      const now = Date.now()
      const nodes: OutlineNode[] = []
      for (const input of params.nodes) {
        const result = createOutlineNodeFromAgentInput(input, {
          now,
          createId: () => generateId(),
        })
        if (!result.ok) {
          return { ok: false, error: 'Agent 工具请求包含空节点标题' }
        }
        nodes.push(result.node)
      }

      const newRoot = updateNodeAtPath(currentDoc.root, parentPath, (node) => {
        const children = [...node.children]
        children.splice(index, 0, ...nodes)
        return {
          ...node,
          children,
          updatedAt: now,
        }
      })
      const newCollapsedIds = new Set(collapsedNodeIds)
      newCollapsedIds.delete(params.parentNodeId)
      const updatedDoc = {
        ...currentDoc,
        root: newRoot,
        updatedAt: now,
      }
      const insertedNodeIds = nodes.map((node) => node.id)

      set((state) => ({
        currentDoc: updatedDoc,
        collapsedNodeIds: newCollapsedIds,
        selectedNodeId: insertedNodeIds[insertedNodeIds.length - 1] ?? state.selectedNodeId,
        isDirty: state.cleanSnapshotKey === null
          ? true
          : createSnapshot(updatedDoc, state.selectedNodeId, newCollapsedIds).key !== state.cleanSnapshotKey,
      }))
      setHistoryAfterMutation(before)

      return { ok: true, insertedNodeIds }
    },
  }
}
