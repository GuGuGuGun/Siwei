import { generateId } from '../../utils/id'
import type { OutlineDocument } from '../../types/document'
import { createDocumentSnapshotKey } from './agentChangePlan'
import type { AgentChangePlan, AgentInsertedNode, AgentOperation } from './agentTypes'
import { firstString, isRecord } from './agentParserUtils'
import { isString } from './agentParserUtils'

export function normalizeLegacyChangePlan(value: unknown, currentDoc: OutlineDocument): AgentChangePlan | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== undefined) return null

  const operations = normalizeLegacyOperations(value, currentDoc)
  if (!operations) return null

  return {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId: firstString(value.documentId) ?? currentDoc.id,
    snapshotKey: firstString(value.snapshotKey) ?? createDocumentSnapshotKey(currentDoc),
    summary: '兼容旧格式生成的修改计划',
    rationale: '旧模型输出缺少审核字段，已按兼容规则转换为可预览计划。',
    riskLevel: 'medium',
    references: [],
    operations,
  }
}

export function normalizeLegacyConcatenatedObjects(
  text: string,
  currentDoc: OutlineDocument,
): AgentChangePlan | null {
  // 旧版模型可能连续输出多个顶层 JSON 对象，这里逐个提取后合并为一次可审阅计划。
  const objects = extractTopLevelJsonObjects(text)
    .map((objectText) => {
      try {
        return JSON.parse(objectText)
      } catch {
        return null
      }
    })
    .filter((value): value is Record<string, unknown> => isRecord(value))

  if (objects.length === 0) return null
  const operations = objects.flatMap((object) => (
    extractLegacyNodeWrappedOperations(object, currentDoc)
  ))
  if (operations.length === 0) return null

  return {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId: currentDoc.id,
    snapshotKey: createDocumentSnapshotKey(currentDoc),
    summary: '兼容旧格式生成的修改计划',
    rationale: '旧模型输出缺少审核字段，已按兼容规则转换为可预览计划。',
    riskLevel: 'medium',
    references: [],
    operations,
  }
}

function extractTopLevelJsonObjects(text: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  // 手写扫描器需要识别字符串和转义字符，避免把 JSON 字符串里的花括号误判为对象边界。
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }

  return objects
}

function normalizeLegacyOperations(
  value: Record<string, unknown>,
  currentDoc: OutlineDocument,
): AgentOperation[] | null {
  const nodeWrappedOperations = extractLegacyNodeWrappedOperations(value, currentDoc)
  if (nodeWrappedOperations.length > 0) return nodeWrappedOperations

  const insertedNodes = extractTreeLikeInsertedNodes(value)
  if (insertedNodes.length === 0) return null

  return insertedNodes.map((node, index) => ({
    type: 'insertNode',
    parentNodeId: currentDoc.root.id,
    index,
    node,
  }))
}

function extractLegacyNodeWrappedOperations(
  value: Record<string, unknown>,
  currentDoc: OutlineDocument,
): AgentOperation[] {
  if (isRecord(value.insertNode)) {
    const operation = normalizeLegacyNodeWrappedInsert(value.insertNode, currentDoc, 0)
    return operation ? [operation] : []
  }

  return Object.values(value)
    .map((entry, index) => {
      if (!isRecord(entry) || !isRecord(entry.insertNode)) return null
      return normalizeLegacyNodeWrappedInsert(entry.insertNode, currentDoc, index)
    })
    .filter((operation): operation is AgentOperation => operation !== null)
}

function normalizeLegacyNodeWrappedInsert(
  insertNode: Record<string, unknown>,
  currentDoc: OutlineDocument,
  fallbackIndex: number,
): AgentOperation | null {
  const parentNodeId = firstString(insertNode.parentNodeId, insertNode.parentId)
    ?? currentDoc.root.id
  const nodeSource = isRecord(insertNode.node) ? insertNode.node : insertNode
  const node = normalizeFlexibleInsertedNode(nodeSource)
  if (!node) return null

  return {
    type: 'insertNode',
    parentNodeId,
    index: typeof insertNode.index === 'number' ? insertNode.index : fallbackIndex,
    node,
  }
}

function extractTreeLikeInsertedNodes(value: Record<string, unknown>): AgentInsertedNode[] {
  if (isRecord(value.root)) {
    // 兼容整棵文档树输出：根节点只是容器，真正要插入的是 root.children。
    const rootChildren = Array.isArray(value.root.children)
      ? value.root.children
      : []
    const children = rootChildren
      .map(normalizeFlexibleInsertedNode)
      .filter((node): node is AgentInsertedNode => node !== null)
    if (children.length > 0) return children
  }

  if (Array.isArray(value.children)) {
    const children = value.children
      .map(normalizeFlexibleInsertedNode)
      .filter((node): node is AgentInsertedNode => node !== null)
    const title = firstString(value.text, value.title, value.label, value.name)
    if (title) {
      return [{
        id: firstString(value.id, value.nodeId) ?? generateId(),
        text: title,
        children,
      }]
    }
    return children
  }

  if (Array.isArray(value.nodes)) {
    return value.nodes
      .map(normalizeFlexibleInsertedNode)
      .filter((node): node is AgentInsertedNode => node !== null)
  }

  const singleNode = normalizeFlexibleInsertedNode(value)
  return singleNode ? [singleNode] : []
}

function normalizeFlexibleInsertedNode(value: unknown): AgentInsertedNode | null {
  if (!isRecord(value)) return null

  // 旧格式常混用 text/title/label/name 和 id/nodeId，只在兼容入口做字段归一，严格协议仍保持收紧。
  const text = firstString(value.text, value.title, value.label, value.name)
  if (!text) return null

  const children = Array.isArray(value.children)
    ? value.children
      .map(normalizeFlexibleInsertedNode)
      .filter((child): child is AgentInsertedNode => child !== null)
    : undefined

  return {
    id: firstString(value.id, value.nodeId) ?? generateId(),
    text,
    note: typeof value.note === 'string' || value.note === null ? value.note : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter(isString) : undefined,
    checked: typeof value.checked === 'boolean' || value.checked === null ? value.checked : undefined,
    children,
  }
}
