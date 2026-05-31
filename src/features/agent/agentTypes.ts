import type { OutlineDocument, OutlineNode } from '../../types/document'

export type AgentContextScope = 'currentDocument'
export type AgentThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type AgentRiskLevel = 'low' | 'medium' | 'high'
export type AgentReferenceSourceType = 'currentDocument' | 'librarySearch'

export interface AgentSettings {
  enabled: boolean
  provider: string
  model: string
  baseUrl: string
  thinkingLevel: AgentThinkingLevel
  contextScope: AgentContextScope
}

export interface AgentDocumentContext {
  schemaVersion: 1
  contextScope: AgentContextScope
  documentId: string
  title: string
  snapshotKey: string
  root: AgentDocumentNodeContext
}

export interface AgentDocumentNodeContext {
  nodeId: string
  text: string
  note?: string
  tags?: string[]
  checked?: boolean
  children: AgentDocumentNodeContext[]
}

export interface AgentStatus {
  available: boolean
  running: boolean
  streaming: boolean
  sessionKey: string | null
  model: string | null
  error: string | null
}

export type AgentOperation =
  | AgentUpdateNodeOperation
  | AgentInsertNodeOperation
  | AgentDeleteNodeOperation
  | AgentMoveNodeOperation

export interface AgentChangePlan {
  schemaVersion: 1
  contextScope: AgentContextScope
  documentId: string
  snapshotKey: string
  summary: string
  rationale: string
  riskLevel: AgentRiskLevel
  references: AgentReference[]
  operations: AgentOperation[]
}

export interface AgentReference {
  sourceType: AgentReferenceSourceType
  documentId: string
  documentTitle?: string
  documentPath?: string
  nodeId?: string
  path: string[]
  snippet?: string
}

export interface AgentUpdateNodeOperation {
  type: 'updateNode'
  nodeId: string
  text?: string
  note?: string | null
  tags?: string[]
  checked?: boolean | null
}

export interface AgentInsertNodeOperation {
  type: 'insertNode'
  parentNodeId: string
  index: number
  node: AgentInsertedNode
}

export interface AgentInsertedNode {
  id: string
  text: string
  note?: string | null
  tags?: string[]
  checked?: boolean | null
  children?: AgentInsertedNode[]
}

export interface AgentDeleteNodeOperation {
  type: 'deleteNode'
  nodeId: string
  reason?: string
}

export interface AgentMoveNodeOperation {
  type: 'moveNode'
  nodeId: string
  targetParentNodeId: string
  index: number
}

export type AgentNodePreview =
  | AgentUpdateNodePreview
  | AgentDeleteNodePreview
  | AgentMoveNodePreview

export interface AgentUpdateNodePreview {
  kind: 'update'
  text?: string
  note?: string | null
  tags?: string[]
  checked?: boolean | null
}

export interface AgentDeleteNodePreview {
  kind: 'delete'
  title: string
  descendantCount: number
  tagCount: number
  taskCount: number
  reason: string
  riskLevel: 'high'
}

export interface AgentMoveNodePreview {
  kind: 'move'
  targetParentNodeId: string
  index: number
}

export interface AgentInsertionPreview {
  index: number
  node: AgentInsertedNode
}

export interface AgentDocumentPreview {
  nodePreviews: Map<string, AgentNodePreview>
  insertionsByParentId: Map<string, AgentInsertionPreview[]>
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: number
}

export interface AgentRpcEventRecord {
  type: string
  toolName?: string
  params?: unknown
  assistantMessageEvent?: {
    type: string
    delta?: string
    content?: string
  }
  message?: {
    role?: string
    errorMessage?: string
    content?: Array<{
      type: string
      text?: string
    }>
  }
  error?: string
}

export interface AgentPlanResultOk {
  ok: true
  document: OutlineDocument
}

export interface AgentPlanResultError {
  ok: false
  error: string
}

export type AgentPlanResult = AgentPlanResultOk | AgentPlanResultError

export type AgentNodeMutation = (node: OutlineNode, now: number) => OutlineNode

export interface AgentMindMapInsertNodesParams {
  documentId: string
  snapshotKey: string
  parentNodeId: string
  index?: number
  nodes: AgentMindMapNodeInput[]
}

export interface AgentMindMapNodeInput {
  text: string
  note?: string | null
  tags?: string[]
  checked?: boolean | null
  children?: AgentMindMapNodeInput[]
}
