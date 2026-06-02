import type { OutlineDocument, OutlineNode } from '../../types/document'
import { findNodeById } from '../../utils/tree'
import { validatePlanRiskSemantics } from './agentPlanValidation'
import { applyAgentOperation } from './agentTreeOperations'
import type {
  AgentChangePlan,
  AgentDocumentPreview,
  AgentDocumentContext,
  AgentDocumentNodeContext,
  AgentNodePreview,
  AgentOperation,
  AgentPlanResult,
} from './agentTypes'

export function createDocumentSnapshotKey(doc: OutlineDocument): string {
  return JSON.stringify(doc)
}

export function createAgentDocumentContext(doc: OutlineDocument): AgentDocumentContext {
  return {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId: doc.id,
    title: doc.title,
    snapshotKey: createDocumentSnapshotKey(doc),
    root: toAgentNodeContext(doc.root),
  }
}

export function createAgentDocumentPreview(plan: AgentChangePlan | null): AgentDocumentPreview {
  const nodePreviews: AgentDocumentPreview['nodePreviews'] = new Map()
  const insertionsByParentId: AgentDocumentPreview['insertionsByParentId'] = new Map()

  if (!plan) {
    return { nodePreviews, insertionsByParentId }
  }

  for (const operation of plan.operations) {
    switch (operation.type) {
      case 'updateNode':
        nodePreviews.set(operation.nodeId, {
          kind: 'update',
          text: operation.text,
          note: operation.note,
          tags: operation.tags,
          checked: operation.checked,
        })
        break
      case 'deleteNode':
        nodePreviews.set(operation.nodeId, createMissingDeletePreview(operation))
        break
      case 'moveNode':
        nodePreviews.set(operation.nodeId, {
          kind: 'move',
          targetParentNodeId: operation.targetParentNodeId,
          index: operation.index,
        })
        break
      case 'insertNode': {
        const current = insertionsByParentId.get(operation.parentNodeId) ?? []
        insertionsByParentId.set(operation.parentNodeId, [
          ...current,
          {
            index: operation.index,
            node: operation.node,
          },
        ])
        break
      }
    }
  }

  for (const [parentId, insertions] of insertionsByParentId) {
    insertionsByParentId.set(
      parentId,
      [...insertions].sort((left, right) => left.index - right.index),
    )
  }

  return { nodePreviews, insertionsByParentId }
}

export function createAgentDocumentPreviewForDocument(
  doc: OutlineDocument,
  plan: AgentChangePlan | null,
): AgentDocumentPreview {
  const preview = createAgentDocumentPreview(plan)
  if (!plan) return preview

  for (const operation of plan.operations) {
    if (operation.type !== 'deleteNode') continue
    const target = findNodeById(doc.root, operation.nodeId)
    if (!target) continue
    preview.nodePreviews.set(operation.nodeId, {
      kind: 'delete',
      title: target.node.text,
      descendantCount: countDescendants(target.node),
      tagCount: collectSubtreeTags(target.node).size,
      taskCount: countSubtreeTasks(target.node),
      reason: normalizePreviewReason(operation.reason),
      riskLevel: 'high',
    })
  }

  return preview
}

export function validateAgentChangePlan(
  doc: OutlineDocument,
  plan: AgentChangePlan,
): { ok: true } | { ok: false; error: string } {
  const result = applyAgentChangePlanToDocument(doc, plan, { validateOnly: true })
  return result.ok ? { ok: true } : result
}

export function applyAgentChangePlanToDocument(
  doc: OutlineDocument,
  plan: AgentChangePlan,
  options: { validateOnly?: boolean } = {},
): AgentPlanResult {
  // snapshotKey 是计划审核和应用之间的乐观锁，避免把旧文档上的操作误用到新状态。
  if (plan.documentId !== doc.id) {
    return { ok: false, error: '修改计划不属于当前文档' }
  }

  if (plan.snapshotKey !== createDocumentSnapshotKey(doc)) {
    return { ok: false, error: '当前文档已变化，请让助理重新生成修改计划' }
  }

  if (plan.operations.length === 0) {
    return { ok: false, error: '修改计划没有包含任何操作' }
  }

  const riskValidation = validatePlanRiskSemantics(plan)
  if (!riskValidation.ok) return riskValidation

  let nextRoot = cloneNode(doc.root)
  const now = Date.now()

  for (const operation of plan.operations) {
    const result = applyAgentOperation(nextRoot, operation, now)
    if (!result.ok) return result
    nextRoot = result.root
  }

  if (options.validateOnly) {
    return { ok: true, document: doc }
  }

  return {
    ok: true,
    document: {
      ...doc,
      updatedAt: now,
      root: nextRoot,
    },
  }
}

function createMissingDeletePreview(operation: Extract<AgentOperation, { type: 'deleteNode' }>): AgentNodePreview {
  return {
    kind: 'delete',
    title: operation.nodeId,
    descendantCount: 0,
    tagCount: 0,
    taskCount: 0,
    reason: normalizePreviewReason(operation.reason),
    riskLevel: 'high',
  }
}

function normalizePreviewReason(reason: string | undefined): string {
  const normalized = reason?.trim()
  return normalized || '未提供删除理由'
}

function toAgentNodeContext(node: OutlineNode): AgentDocumentNodeContext {
  return {
    nodeId: node.id,
    text: node.text,
    note: node.note,
    tags: node.tags,
    checked: node.checked,
    children: node.children.map(toAgentNodeContext),
  }
}

function countDescendants(node: OutlineNode): number {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0)
}

function countSubtreeTasks(node: OutlineNode): number {
  const current = node.checked === undefined ? 0 : 1
  return current + node.children.reduce((count, child) => count + countSubtreeTasks(child), 0)
}

function collectSubtreeTags(node: OutlineNode): Set<string> {
  const tags = new Set(node.tags ?? [])
  node.children.forEach((child) => {
    collectSubtreeTags(child).forEach((tag) => tags.add(tag))
  })
  return tags
}

function cloneNode(node: OutlineNode): OutlineNode {
  return {
    ...node,
    tags: node.tags ? [...node.tags] : undefined,
    children: node.children.map(cloneNode),
  }
}
