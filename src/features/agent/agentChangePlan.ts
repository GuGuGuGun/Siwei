import type { OutlineDocument, OutlineNode } from '../../types/document'
import type {
  AgentChangePlan,
  AgentDocumentPreview,
  AgentDocumentContext,
  AgentDocumentNodeContext,
  AgentInsertedNode,
  AgentOperation,
  AgentPlanResult,
} from './agentTypes'

interface LocatedNode {
  node: OutlineNode
  path: number[]
}

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
        nodePreviews.set(operation.nodeId, { kind: 'delete' })
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
  if (plan.documentId !== doc.id) {
    return { ok: false, error: '修改计划不属于当前文档' }
  }

  if (plan.snapshotKey !== createDocumentSnapshotKey(doc)) {
    return { ok: false, error: '当前文档已变化，请让助理重新生成修改计划' }
  }

  if (plan.operations.length === 0) {
    return { ok: false, error: '修改计划没有包含任何操作' }
  }

  let nextRoot = cloneNode(doc.root)
  const now = Date.now()

  for (const operation of plan.operations) {
    const result = applyOperation(nextRoot, operation, now)
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

function applyOperation(
  root: OutlineNode,
  operation: AgentOperation,
  now: number,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  switch (operation.type) {
    case 'updateNode':
      return updateNode(root, operation.nodeId, (node) => ({
        ...node,
        text: operation.text ?? node.text,
        note: operation.note === undefined ? node.note : normalizeOptionalText(operation.note),
        tags: operation.tags === undefined ? node.tags : normalizeTags(operation.tags),
        checked: operation.checked === undefined ? node.checked : operation.checked ?? undefined,
        updatedAt: now,
      }))
    case 'insertNode':
      return insertNode(root, operation.parentNodeId, operation.index, operation.node, now)
    case 'deleteNode':
      return deleteNode(root, operation.nodeId)
    case 'moveNode':
      return moveNode(root, operation.nodeId, operation.targetParentNodeId, operation.index)
    default: {
      const unreachable: never = operation
      return { ok: false, error: `不支持的修改操作: ${String(unreachable)}` }
    }
  }
}

function updateNode(
  root: OutlineNode,
  nodeId: string,
  updater: (node: OutlineNode) => OutlineNode,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  if (!findNode(root, nodeId)) return { ok: false, error: `节点不存在: ${nodeId}` }

  return {
    ok: true,
    root: mapNode(root, (node) => (node.id === nodeId ? updater(node) : node)),
  }
}

function insertNode(
  root: OutlineNode,
  parentNodeId: string,
  index: number,
  inserted: AgentInsertedNode,
  now: number,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  const parent = findNode(root, parentNodeId)
  if (!parent) return { ok: false, error: `父节点不存在: ${parentNodeId}` }
  if (findNode(root, inserted.id)) return { ok: false, error: `节点 ID 已存在: ${inserted.id}` }
  if (index < 0 || index > parent.node.children.length) {
    return { ok: false, error: `插入位置无效: ${parentNodeId}[${index}]` }
  }

  const newNode = createOutlineNode(inserted, now)
  return updateNode(root, parentNodeId, (node) => {
    const children = [...node.children]
    children.splice(index, 0, newNode)
    return {
      ...node,
      children,
      updatedAt: now,
    }
  })
}

function deleteNode(
  root: OutlineNode,
  nodeId: string,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  const target = findNode(root, nodeId)
  if (!target) return { ok: false, error: `节点不存在: ${nodeId}` }
  if (target.path.length === 0) return { ok: false, error: '不能删除根节点' }

  const parentPath = target.path.slice(0, -1)
  const index = target.path[target.path.length - 1]
  return {
    ok: true,
    root: updateNodeAtPath(root, parentPath, (parent) => ({
      ...parent,
      children: parent.children.filter((_, childIndex) => childIndex !== index),
    })),
  }
}

function moveNode(
  root: OutlineNode,
  nodeId: string,
  targetParentNodeId: string,
  index: number,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  const source = findNode(root, nodeId)
  const targetParent = findNode(root, targetParentNodeId)
  if (!source) return { ok: false, error: `节点不存在: ${nodeId}` }
  if (!targetParent) return { ok: false, error: `目标父节点不存在: ${targetParentNodeId}` }
  if (source.path.length === 0) return { ok: false, error: '不能移动根节点' }
  if (isPathPrefix(source.path, targetParent.path)) {
    return { ok: false, error: '不能将节点移动到自身或其子节点下' }
  }

  const sourceParentPath = source.path.slice(0, -1)
  const sourceIndex = source.path[source.path.length - 1]
  const targetParentPath = adjustTargetPathAfterRemoval(source.path, targetParent.path)
  const rootWithoutSource = updateNodeAtPath(root, sourceParentPath, (parent) => ({
    ...parent,
    children: parent.children.filter((_, childIndex) => childIndex !== sourceIndex),
  }))
  const adjustedParent = getNodeAtPath(rootWithoutSource, targetParentPath)

  if (!adjustedParent || index < 0 || index > adjustedParent.children.length) {
    return { ok: false, error: `移动位置无效: ${targetParentNodeId}[${index}]` }
  }

  return {
    ok: true,
    root: updateNodeAtPath(rootWithoutSource, targetParentPath, (parent) => {
      const children = [...parent.children]
      children.splice(index, 0, source.node)
      return { ...parent, children }
    }),
  }
}

function createOutlineNode(node: AgentInsertedNode, now: number): OutlineNode {
  return {
    id: node.id,
    text: node.text,
    note: normalizeOptionalText(node.note),
    checked: node.checked ?? undefined,
    tags: normalizeTags(node.tags ?? []),
    createdAt: now,
    updatedAt: now,
    children: (node.children ?? []).map((child) => createOutlineNode(child, now)),
  }
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeTags(tags: string[]): string[] | undefined {
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort()
  return normalized.length > 0 ? normalized : undefined
}

function findNode(root: OutlineNode, nodeId: string, path: number[] = []): LocatedNode | null {
  if (root.id === nodeId) return { node: root, path }

  for (let index = 0; index < root.children.length; index += 1) {
    const found = findNode(root.children[index], nodeId, [...path, index])
    if (found) return found
  }

  return null
}

function cloneNode(node: OutlineNode): OutlineNode {
  return {
    ...node,
    tags: node.tags ? [...node.tags] : undefined,
    children: node.children.map(cloneNode),
  }
}

function mapNode(node: OutlineNode, mapper: (node: OutlineNode) => OutlineNode): OutlineNode {
  const mapped = mapper(node)
  return {
    ...mapped,
    children: mapped.children.map((child) => mapNode(child, mapper)),
  }
}

function getNodeAtPath(root: OutlineNode, path: number[]): OutlineNode | null {
  let node = root
  for (const index of path) {
    if (index < 0 || index >= node.children.length) return null
    node = node.children[index]
  }
  return node
}

function updateNodeAtPath(
  root: OutlineNode,
  path: number[],
  updater: (node: OutlineNode) => OutlineNode,
): OutlineNode {
  if (path.length === 0) return updater(root)
  const [index, ...rest] = path
  return {
    ...root,
    children: root.children.map((child, childIndex) => (
      childIndex === index ? updateNodeAtPath(child, rest, updater) : child
    )),
  }
}

function isPathPrefix(parent: number[], child: number[]): boolean {
  return parent.length <= child.length && parent.every((value, index) => value === child[index])
}

function adjustTargetPathAfterRemoval(sourcePath: number[], targetParentPath: number[]): number[] {
  const sourceParentPath = sourcePath.slice(0, -1)
  if (!isPathPrefix(sourceParentPath, targetParentPath)) return targetParentPath

  const sourceIndex = sourcePath[sourcePath.length - 1]
  const affectedDepth = sourceParentPath.length
  const targetIndexAtDepth = targetParentPath[affectedDepth]
  if (targetIndexAtDepth === undefined || targetIndexAtDepth <= sourceIndex) return targetParentPath

  const adjusted = [...targetParentPath]
  adjusted[affectedDepth] = targetIndexAtDepth - 1
  return adjusted
}
