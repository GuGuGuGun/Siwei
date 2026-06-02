import type { OutlineDocument, OutlineNode } from '../../types/document'
import { generateId } from '../../utils/id'
import { findNodeById } from '../../utils/tree'
import { createAgentDocumentContext } from './agentChangePlan'
import type {
  AgentChangePlan,
  AgentInsertedNode,
  AgentMindMapDeleteNodesParams,
  AgentMindMapInsertNodesParams,
  AgentMindMapMoveNodesParams,
  AgentMindMapNodeInput,
  AgentMindMapUpdateNodesParams,
} from './agentTypes'

type PlanResult = { ok: true; plan: AgentChangePlan } | { ok: false; error: string }

export function createMindMapInsertPlan(
  currentDoc: OutlineDocument | null,
  params: AgentMindMapInsertNodesParams,
  createId: () => string = generateId,
): PlanResult {
  if (!currentDoc) return { ok: false, error: '当前没有可修改的文档' }
  const validation = validateToolDocumentContext(currentDoc, params)
  if (!validation.ok) return validation
  if (params.nodes.length === 0) {
    return { ok: false, error: 'Agent 工具请求没有包含节点' }
  }

  const insertedNodes = params.nodes
    .map((input) => createInsertedNodeFromMindMapInput(input, createId))
    .filter((node): node is AgentInsertedNode => node !== null)
  if (insertedNodes.length !== params.nodes.length) {
    return { ok: false, error: 'Agent 工具请求包含空节点标题' }
  }

  const parentNode = findNodeById(currentDoc.root, params.parentNodeId)?.node
  if (!parentNode) return { ok: false, error: `父节点不存在: ${params.parentNodeId}` }
  const index = params.index ?? parentNode.children.length
  if (index < 0 || index > parentNode.children.length) {
    return { ok: false, error: `插入位置无效: ${params.parentNodeId}[${index}]` }
  }

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      contextScope: 'currentDocument',
      documentId: params.documentId,
      snapshotKey: params.snapshotKey,
      summary: `待确认插入 ${insertedNodes.length} 个节点`,
      rationale: '助理已生成思维导图节点，确认后才会写入当前文档。',
      riskLevel: 'low',
      references: [],
      operations: insertedNodes.map((node, offset) => ({
        type: 'insertNode',
        parentNodeId: params.parentNodeId,
        index: index + offset,
        node,
      })),
    },
  }
}

export function createMindMapUpdatePlan(
  currentDoc: OutlineDocument | null,
  params: AgentMindMapUpdateNodesParams,
): PlanResult {
  const validation = validateToolDocumentContext(currentDoc, params)
  if (!validation.ok) return validation
  if (params.updates.length === 0) {
    return { ok: false, error: 'Agent 工具请求没有包含节点更新' }
  }

  for (const update of params.updates) {
    if (!findNodeById(validation.doc.root, update.nodeId)) {
      return { ok: false, error: `节点不存在: ${update.nodeId}` }
    }
  }

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      contextScope: 'currentDocument',
      documentId: params.documentId,
      snapshotKey: params.snapshotKey,
      summary: `待确认更新 ${params.updates.length} 个节点`,
      rationale: '助理已生成节点更新，确认后才会写入当前文档。',
      riskLevel: 'low',
      references: createCurrentDocumentReferences(validation.doc, params.updates.map((update) => update.nodeId)),
      operations: params.updates.map((update) => ({
        type: 'updateNode',
        nodeId: update.nodeId,
        text: update.text,
        note: update.note,
        tags: update.tags,
        checked: update.checked,
      })),
    },
  }
}

export function createMindMapMovePlan(
  currentDoc: OutlineDocument | null,
  params: AgentMindMapMoveNodesParams,
): PlanResult {
  const validation = validateToolDocumentContext(currentDoc, params)
  if (!validation.ok) return validation
  if (params.moves.length === 0) {
    return { ok: false, error: 'Agent 工具请求没有包含节点移动' }
  }

  for (const move of params.moves) {
    if (!findNodeById(validation.doc.root, move.nodeId)) {
      return { ok: false, error: `节点不存在: ${move.nodeId}` }
    }
    const targetParent = findNodeById(validation.doc.root, move.targetParentNodeId)?.node
    if (!targetParent) {
      return { ok: false, error: `目标父节点不存在: ${move.targetParentNodeId}` }
    }
    if (move.index < 0 || move.index > targetParent.children.length) {
      return { ok: false, error: `移动位置无效: ${move.targetParentNodeId}[${move.index}]` }
    }
  }

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      contextScope: 'currentDocument',
      documentId: params.documentId,
      snapshotKey: params.snapshotKey,
      summary: `待确认移动 ${params.moves.length} 个节点`,
      rationale: '助理已生成节点移动方案，确认后才会调整当前文档结构。',
      riskLevel: 'medium',
      references: createCurrentDocumentReferences(validation.doc, params.moves.map((move) => move.nodeId)),
      operations: params.moves.map((move) => ({
        type: 'moveNode',
        nodeId: move.nodeId,
        targetParentNodeId: move.targetParentNodeId,
        index: move.index,
      })),
    },
  }
}

export function createMindMapDeletePlan(
  currentDoc: OutlineDocument | null,
  params: AgentMindMapDeleteNodesParams,
): PlanResult {
  const validation = validateToolDocumentContext(currentDoc, params)
  if (!validation.ok) return validation
  if (params.deletes.length === 0) {
    return { ok: false, error: 'Agent 工具请求没有包含节点删除' }
  }

  for (const deleteInput of params.deletes) {
    if (!findNodeById(validation.doc.root, deleteInput.nodeId)) {
      return { ok: false, error: `节点不存在: ${deleteInput.nodeId}` }
    }
  }

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      contextScope: 'currentDocument',
      documentId: params.documentId,
      snapshotKey: params.snapshotKey,
      summary: `待确认删除 ${params.deletes.length} 个节点`,
      rationale: '助理已生成节点删除方案，删除属于高风险操作，请确认后再应用。',
      riskLevel: 'high',
      references: createCurrentDocumentReferences(validation.doc, params.deletes.map((deleteInput) => deleteInput.nodeId)),
      operations: params.deletes.map((deleteInput) => ({
        type: 'deleteNode',
        nodeId: deleteInput.nodeId,
        reason: deleteInput.reason,
      })),
    },
  }
}

function validateToolDocumentContext(
  currentDoc: OutlineDocument | null,
  params: { documentId: string; snapshotKey: string },
): { ok: true; doc: OutlineDocument } | { ok: false; error: string } {
  if (!currentDoc) return { ok: false, error: '当前没有可修改的文档' }
  if (params.documentId !== currentDoc.id) {
    return { ok: false, error: 'Agent 工具请求不属于当前文档' }
  }

  const context = createAgentDocumentContext(currentDoc)
  if (params.snapshotKey !== context.snapshotKey) {
    return { ok: false, error: '当前文档已变化，请让助理重新生成节点' }
  }

  return { ok: true, doc: currentDoc }
}

function createCurrentDocumentReferences(
  doc: OutlineDocument,
  nodeIds: string[],
): AgentChangePlan['references'] {
  const references: AgentChangePlan['references'] = []
  for (const nodeId of new Set(nodeIds)) {
    const located = findNodeById(doc.root, nodeId)
    if (!located) continue
    references.push({
      sourceType: 'currentDocument',
      documentId: doc.id,
      documentTitle: doc.title,
      nodeId,
      path: findNodeTextPath(doc.root, nodeId) ?? [located.node.text],
      snippet: located.node.text,
    })
  }
  return references
}

function findNodeTextPath(root: OutlineNode, nodeId: string, path: string[] = []): string[] | null {
  if (root.id === nodeId) return path
  for (const child of root.children) {
    const result = findNodeTextPath(child, nodeId, [...path, child.text])
    if (result) return result
  }
  return null
}

function createInsertedNodeFromMindMapInput(
  input: AgentMindMapNodeInput,
  createId: () => string,
): AgentInsertedNode | null {
  const text = input.text.trim()
  if (!text) return null

  const children = (input.children ?? [])
    .map((child) => createInsertedNodeFromMindMapInput(child, createId))
  if (children.some((node) => node === null)) return null

  return {
    id: createId(),
    text,
    note: input.note,
    tags: input.tags,
    checked: input.checked,
    children: children.filter((node): node is AgentInsertedNode => node !== null),
  }
}
