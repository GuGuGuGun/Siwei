import type {
  AgentChangePlan,
  AgentInsertedNode,
  AgentOperation,
  AgentReference,
} from './agentTypes'
import { firstString, isRecord, isString } from './agentParserUtils'

export function normalizeStrictChangePlan(value: unknown): AgentChangePlan | null {
  if (!isRecord(value)) return null
  if (
    value.schemaVersion !== 1
    || value.contextScope !== 'currentDocument'
    || typeof value.documentId !== 'string'
    || typeof value.snapshotKey !== 'string'
    || typeof value.summary !== 'string'
    || typeof value.rationale !== 'string'
    || !isRiskLevel(value.riskLevel)
    || !Array.isArray(value.references)
    || !Array.isArray(value.operations)
  ) {
    return null
  }

  const references = value.references
    .map(normalizeReference)
    .filter((reference): reference is AgentReference => reference !== null)
  const operations = value.operations
    .map(normalizeOperation)
    .filter((operation): operation is AgentOperation => operation !== null)

  if (
    references.length !== value.references.length
    || operations.length !== value.operations.length
  ) {
    return null
  }

  return {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId: value.documentId,
    snapshotKey: value.snapshotKey,
    summary: value.summary,
    rationale: value.rationale,
    riskLevel: value.riskLevel,
    references,
    operations,
  }
}

function normalizeReference(value: unknown): AgentReference | null {
  if (!isRecord(value)) return null
  if (
    value.sourceType !== 'currentDocument'
    && value.sourceType !== 'librarySearch'
  ) return null
  if (typeof value.documentId !== 'string' || !Array.isArray(value.path)) return null

  return {
    sourceType: value.sourceType,
    documentId: value.documentId,
    documentTitle: typeof value.documentTitle === 'string' ? value.documentTitle : undefined,
    documentPath: typeof value.documentPath === 'string' ? value.documentPath : undefined,
    nodeId: typeof value.nodeId === 'string' ? value.nodeId : undefined,
    path: value.path.filter(isString),
    snippet: typeof value.snippet === 'string' ? value.snippet : undefined,
  }
}

function normalizeOperation(value: unknown): AgentOperation | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null

  if (value.type === 'updateNode' && typeof value.nodeId === 'string') {
    return {
      type: 'updateNode',
      nodeId: value.nodeId,
      text: typeof value.text === 'string' ? value.text : undefined,
      note: typeof value.note === 'string' || value.note === null ? value.note : undefined,
      tags: Array.isArray(value.tags) ? value.tags.filter(isString) : undefined,
      checked: typeof value.checked === 'boolean' || value.checked === null ? value.checked : undefined,
    }
  }

  if (value.type === 'insertNode') {
    const parentNodeId = firstString(value.parentNodeId, value.parentId)
    if (!parentNodeId || typeof value.index !== 'number' || !isRecord(value.node)) return null
    const node = normalizeInsertedNode(value.node)
    if (!node) return null
    return {
      type: 'insertNode',
      parentNodeId,
      index: value.index,
      node,
    }
  }

  if (value.type === 'deleteNode' && typeof value.nodeId === 'string') {
    return {
      type: 'deleteNode',
      nodeId: value.nodeId,
      reason: typeof value.reason === 'string' ? value.reason : undefined,
    }
  }

  if (value.type === 'moveNode') {
    const targetParentNodeId = firstString(
      value.targetParentNodeId,
      value.targetParentId,
      value.parentNodeId,
      value.parentId,
    )
    if (!targetParentNodeId || typeof value.nodeId !== 'string' || typeof value.index !== 'number') {
      return null
    }
    return {
      type: 'moveNode',
      nodeId: value.nodeId,
      targetParentNodeId,
      index: value.index,
    }
  }

  return null
}

function normalizeInsertedNode(value: Record<string, unknown>): AgentInsertedNode | null {
  if (typeof value.id !== 'string' || typeof value.text !== 'string') return null
  const children = Array.isArray(value.children)
    ? value.children
      .map((child) => (isRecord(child) ? normalizeInsertedNode(child) : null))
      .filter((child): child is AgentInsertedNode => child !== null)
    : undefined

  return {
    id: value.id,
    text: value.text,
    note: typeof value.note === 'string' || value.note === null ? value.note : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter(isString) : undefined,
    checked: typeof value.checked === 'boolean' || value.checked === null ? value.checked : undefined,
    children,
  }
}

function isRiskLevel(value: unknown): value is AgentChangePlan['riskLevel'] {
  return value === 'low' || value === 'medium' || value === 'high'
}
