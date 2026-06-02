import type { OutlineNode } from '../../types/document'
import {
  adjustTargetPathAfterNodeRemoval,
  findNodeById,
  getNodeAtPath,
  isTreePathPrefix,
  updateNodeAtPath,
} from '../../utils/tree'
import { createOutlineNodeFromAgentInput, normalizeAgentOptionalText, normalizeAgentTags } from './agentNormalization'
import type { AgentOperation } from './agentTypes'

export function applyAgentOperation(
  root: OutlineNode,
  operation: AgentOperation,
  now: number,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  switch (operation.type) {
    case 'updateNode':
      return updateNode(root, operation.nodeId, (node) => ({
        ...node,
        text: operation.text ?? node.text,
        note: operation.note === undefined ? node.note : normalizeAgentOptionalText(operation.note),
        tags: operation.tags === undefined ? node.tags : normalizeAgentTags(operation.tags),
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
  if (!findNodeById(root, nodeId)) return { ok: false, error: `节点不存在: ${nodeId}` }

  return {
    ok: true,
    root: mapNode(root, (node) => (node.id === nodeId ? updater(node) : node)),
  }
}

function insertNode(
  root: OutlineNode,
  parentNodeId: string,
  index: number,
  inserted: Extract<AgentOperation, { type: 'insertNode' }>['node'],
  now: number,
): { ok: true; root: OutlineNode } | { ok: false; error: string } {
  const parent = findNodeById(root, parentNodeId)
  if (!parent) return { ok: false, error: `父节点不存在: ${parentNodeId}` }
  if (findNodeById(root, inserted.id)) return { ok: false, error: `节点 ID 已存在: ${inserted.id}` }
  if (index < 0 || index > parent.node.children.length) {
    return { ok: false, error: `插入位置无效: ${parentNodeId}[${index}]` }
  }

  const newNode = createOutlineNodeFromAgentInput(inserted, {
    now,
    createId: (input) => input.id,
  })
  if (!newNode.ok) return { ok: false, error: '插入节点标题不能为空' }

  return updateNode(root, parentNodeId, (node) => {
    const children = [...node.children]
    children.splice(index, 0, newNode.node)
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
  const target = findNodeById(root, nodeId)
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
  const source = findNodeById(root, nodeId)
  const targetParent = findNodeById(root, targetParentNodeId)
  if (!source) return { ok: false, error: `节点不存在: ${nodeId}` }
  if (!targetParent) return { ok: false, error: `目标父节点不存在: ${targetParentNodeId}` }
  if (source.path.length === 0) return { ok: false, error: '不能移动根节点' }
  // Agent 计划同样必须维护树结构不变量，不能把节点移动到自身子树里。
  if (isTreePathPrefix(source.path, targetParent.path)) {
    return { ok: false, error: '不能将节点移动到自身或其子节点下' }
  }

  const sourceParentPath = source.path.slice(0, -1)
  const sourceIndex = source.path[source.path.length - 1]
  const targetParentPath = adjustTargetPathAfterNodeRemoval(source.path, targetParent.path)
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

function mapNode(node: OutlineNode, mapper: (node: OutlineNode) => OutlineNode): OutlineNode {
  const mapped = mapper(node)
  return {
    ...mapped,
    children: mapped.children.map((child) => mapNode(child, mapper)),
  }
}
