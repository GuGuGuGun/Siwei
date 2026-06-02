import type {
  AgentMindMapDeleteNodesParams,
  AgentMindMapInsertNodesParams,
  AgentMindMapMoveNodesParams,
  AgentMindMapUpdateNodesParams,
} from './agentTypes'

export function normalizeMindMapInsertNodesParams(value: unknown): AgentMindMapInsertNodesParams | null {
  if (!isRecord(value)) return null
  if (
    typeof value.documentId !== 'string'
    || typeof value.snapshotKey !== 'string'
    || typeof value.parentNodeId !== 'string'
    || !Array.isArray(value.nodes)
  ) return null

  const nodes = value.nodes
    .map(normalizeMindMapNodeInput)
    .filter((node): node is AgentMindMapInsertNodesParams['nodes'][number] => node !== null)
  if (nodes.length !== value.nodes.length) return null

  return {
    documentId: value.documentId,
    snapshotKey: value.snapshotKey,
    parentNodeId: value.parentNodeId,
    index: typeof value.index === 'number' ? value.index : undefined,
    nodes,
  }
}

export function normalizeMindMapUpdateNodesParams(value: unknown): AgentMindMapUpdateNodesParams | null {
  if (!isRecord(value)) return null
  if (
    typeof value.documentId !== 'string'
    || typeof value.snapshotKey !== 'string'
    || !Array.isArray(value.updates)
  ) return null

  const updates = value.updates
    .map(normalizeMindMapNodeUpdateInput)
    .filter((update): update is AgentMindMapUpdateNodesParams['updates'][number] => update !== null)
  if (updates.length !== value.updates.length) return null

  return {
    documentId: value.documentId,
    snapshotKey: value.snapshotKey,
    updates,
  }
}

export function normalizeMindMapMoveNodesParams(value: unknown): AgentMindMapMoveNodesParams | null {
  if (!isRecord(value)) return null
  if (
    typeof value.documentId !== 'string'
    || typeof value.snapshotKey !== 'string'
    || !Array.isArray(value.moves)
  ) return null

  const moves = value.moves
    .map(normalizeMindMapNodeMoveInput)
    .filter((move): move is AgentMindMapMoveNodesParams['moves'][number] => move !== null)
  if (moves.length !== value.moves.length) return null

  return {
    documentId: value.documentId,
    snapshotKey: value.snapshotKey,
    moves,
  }
}

export function normalizeMindMapDeleteNodesParams(value: unknown): AgentMindMapDeleteNodesParams | null {
  if (!isRecord(value)) return null
  if (
    typeof value.documentId !== 'string'
    || typeof value.snapshotKey !== 'string'
    || !Array.isArray(value.deletes)
  ) return null

  const deletes = value.deletes
    .map(normalizeMindMapNodeDeleteInput)
    .filter((deleteInput): deleteInput is AgentMindMapDeleteNodesParams['deletes'][number] => deleteInput !== null)
  if (deletes.length !== value.deletes.length) return null

  return {
    documentId: value.documentId,
    snapshotKey: value.snapshotKey,
    deletes,
  }
}

function normalizeMindMapNodeInput(
  value: unknown,
): AgentMindMapInsertNodesParams['nodes'][number] | null {
  if (!isRecord(value) || typeof value.text !== 'string') return null
  const children = Array.isArray(value.children)
    ? value.children
      .map(normalizeMindMapNodeInput)
      .filter((node): node is AgentMindMapInsertNodesParams['nodes'][number] => node !== null)
    : undefined

  if (Array.isArray(value.children) && children?.length !== value.children.length) return null

  return {
    text: value.text,
    note: typeof value.note === 'string' || value.note === null ? value.note : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter(isString) : undefined,
    checked: typeof value.checked === 'boolean' || value.checked === null ? value.checked : undefined,
    children,
  }
}

function normalizeMindMapNodeUpdateInput(
  value: unknown,
): AgentMindMapUpdateNodesParams['updates'][number] | null {
  if (!isRecord(value) || typeof value.nodeId !== 'string') return null
  return {
    nodeId: value.nodeId,
    text: typeof value.text === 'string' ? value.text : undefined,
    note: typeof value.note === 'string' || value.note === null ? value.note : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter(isString) : undefined,
    checked: typeof value.checked === 'boolean' || value.checked === null ? value.checked : undefined,
  }
}

function normalizeMindMapNodeMoveInput(
  value: unknown,
): AgentMindMapMoveNodesParams['moves'][number] | null {
  if (
    !isRecord(value)
    || typeof value.nodeId !== 'string'
    || typeof value.targetParentNodeId !== 'string'
    || typeof value.index !== 'number'
  ) return null

  return {
    nodeId: value.nodeId,
    targetParentNodeId: value.targetParentNodeId,
    index: value.index,
  }
}

function normalizeMindMapNodeDeleteInput(
  value: unknown,
): AgentMindMapDeleteNodesParams['deletes'][number] | null {
  if (!isRecord(value) || typeof value.nodeId !== 'string') return null
  return {
    nodeId: value.nodeId,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
