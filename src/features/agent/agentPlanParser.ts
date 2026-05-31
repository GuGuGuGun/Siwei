import { generateId } from '../../utils/id'
import type { OutlineDocument } from '../../types/document'
import { createDocumentSnapshotKey } from './agentChangePlan'
import type {
  AgentChangePlan,
  AgentInsertedNode,
  AgentOperation,
  AgentReference,
} from './agentTypes'

export type AgentResponseParseResult =
  | { kind: 'plan'; plan: AgentChangePlan; legacy: boolean }
  | { kind: 'message'; text: string; warning?: string }

export function parseAgentResponseText(
  text: string,
  currentDoc: OutlineDocument | null,
): AgentResponseParseResult {
  const strippedText = stripJsonFence(text.trim())
  const jsonText = extractJsonObject(strippedText)
  if (!jsonText) return { kind: 'message', text }

  // 先走严格协议，只有完整 JSON 对象不满足新 schema 时才降级到旧模型兼容路径。
  if (isBalancedJsonObjectText(jsonText)) {
    const parsed = JSON.parse(jsonText)
    const strictPlan = normalizeStrictChangePlan(parsed)
    if (strictPlan) return { kind: 'plan', plan: strictPlan, legacy: false }

    if (isRecord(parsed) && parsed.schemaVersion !== undefined) {
      return { kind: 'message', text, warning: '未生成可应用修改' }
    }

    const legacyPlan = currentDoc ? normalizeLegacyChangePlan(parsed, currentDoc) : null
    if (legacyPlan) return { kind: 'plan', plan: legacyPlan, legacy: true }
  }

  const legacyPlan = currentDoc
    ? normalizeLegacyConcatenatedObjects(jsonText, currentDoc)
    : null
  if (legacyPlan) return { kind: 'plan', plan: legacyPlan, legacy: true }

  return { kind: 'message', text, warning: '未生成可应用修改' }
}

export function looksLikeStructuredAgentOutput(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('{')
    || trimmed.startsWith('```json')
    || trimmed.startsWith('```')
    || trimmed.startsWith('"documentId')
    || trimmed.startsWith('documentId')
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return text.slice(start, end + 1)
}

function normalizeStrictChangePlan(value: unknown): AgentChangePlan | null {
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

function normalizeLegacyChangePlan(value: unknown, currentDoc: OutlineDocument): AgentChangePlan | null {
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

function normalizeLegacyConcatenatedObjects(
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

function isRiskLevel(value: unknown): value is AgentChangePlan['riskLevel'] {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBalancedJsonObjectText(text: string): boolean {
  let depth = 0
  let inString = false
  let escaped = false

  // 只有单个完整对象才允许 JSON.parse；混杂解释文本或拼接对象会进入兼容解析。
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
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && index !== text.length - 1) return false
      if (depth < 0) return false
    }
  }

  return depth === 0 && !inString
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}
