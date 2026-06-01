import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'

import { createAgentDocumentContext } from './agentChangePlan'
import type {
  AgentChangePlan,
  AgentChatMessage,
  AgentInsertedNode,
  AgentMindMapDeleteNodesParams,
  AgentMindMapInsertNodesParams,
  AgentMindMapMoveNodesParams,
  AgentMindMapNodeInput,
  AgentMindMapUpdateNodesParams,
  AgentRpcEventRecord,
  AgentStatus,
} from './agentTypes'
import {
  looksLikeStructuredAgentOutput,
  parseAgentResponseText,
} from './agentPlanParser'
import { useDocumentStore } from '../document/documentStore'
import * as api from '../../services/siweiApi'
import { generateId } from '../../utils/id'
import type { OutlineNode } from '../../types/document'

interface AgentState {
  isOpen: boolean
  isSending: boolean
  messages: AgentChatMessage[]
  pendingPlan: AgentChangePlan | null
  status: AgentStatus | null
  error: string | null
  setOpen: (isOpen: boolean) => void
  loadStatus: () => Promise<void>
  sendMessage: (message: string) => Promise<void>
  abort: () => Promise<void>
  setPendingPlan: (plan: AgentChangePlan) => void
  rejectPendingPlan: () => void
  applyPendingPlan: () => { ok: true } | { ok: false; error: string }
  attachEventListeners: () => Promise<void>
  handleRpcEvent?: (payload: string) => void
}

let eventsAttached = false
let streamedAgentText = ''
let isStreamingStructuredPlan = false

export const useAgentStore = create<AgentState>((set, get) => ({
  isOpen: false,
  isSending: false,
  messages: [],
  pendingPlan: null,
  status: null,
  error: null,

  setOpen: (isOpen) => set({ isOpen }),

  loadStatus: async () => {
    const status = await api.agentGetStatus()
    set({ status, error: status.error })
  },

  sendMessage: async (message) => {
    const trimmed = message.trim()
    const currentDoc = useDocumentStore.getState().currentDoc
    if (!trimmed || !currentDoc) return

    const sessionKey = useDocumentStore.getState().currentFilePath ?? currentDoc.id
    const context = createAgentDocumentContext(currentDoc)
    const userMessage = createMessage('user', trimmed)

    set((state) => ({
      messages: [...state.messages, userMessage],
      isSending: true,
      error: null,
      pendingPlan: null,
    }))
    streamedAgentText = ''
    isStreamingStructuredPlan = false

    try {
      await api.agentStartSession(sessionKey)
      await api.agentSendMessage(trimmed, context)
      const status = await api.agentGetStatus()
      set({
        status,
        isSending: status.streaming,
        error: status.error,
      })
    } catch (error) {
      set({
        isSending: false,
        error: String(error),
      })
      throw error
    }
  },

  abort: async () => {
    await api.agentAbort()
    await get().loadStatus()
  },

  setPendingPlan: (pendingPlan) => set({ pendingPlan, error: null }),

  rejectPendingPlan: () => set({ pendingPlan: null }),

  applyPendingPlan: () => {
    const plan = get().pendingPlan
    if (!plan) return { ok: false, error: '没有可应用的修改计划' }

    const result = useDocumentStore.getState().applyAgentChangePlan(plan)
    if (result.ok) {
      set({ pendingPlan: null, error: null })
      return { ok: true }
    }

    set({ error: result.error })
    return result
  },

  attachEventListeners: async () => {
    if (eventsAttached || !('__TAURI_INTERNALS__' in window)) return
    eventsAttached = true

    await listen<string>('agent://event', (event) => {
      useAgentStore.getState().handleRpcEvent?.(event.payload)
    })
    await listen<string>('agent://error', (event) => {
      set({ error: event.payload, isSending: false })
    })
  },
}))

const setInternalHandler = () => {
  useAgentStore.setState({
    handleRpcEvent: (payload: string) => {
      try {
        const record = JSON.parse(payload) as AgentRpcEventRecord
        if (record.type === 'agent_end') {
          if (isStreamingStructuredPlan && streamedAgentText) {
            const parsed = parseAgentResponseText(
              streamedAgentText,
              useDocumentStore.getState().currentDoc,
            )
            streamedAgentText = ''
            isStreamingStructuredPlan = false

            if (parsed.kind === 'plan') {
              useAgentStore.setState({
                pendingPlan: parsed.plan,
                error: null,
                isSending: false,
              })
              return
            }

            useAgentStore.setState({
              isSending: false,
              error: parsed.warning ?? '未生成可应用修改',
            })
            return
          }

          const shouldReportParseFailure = isStreamingStructuredPlan
            && !useAgentStore.getState().pendingPlan
          streamedAgentText = ''
          isStreamingStructuredPlan = false
          useAgentStore.setState({
            isSending: false,
            error: shouldReportParseFailure ? '未生成可应用修改' : useAgentStore.getState().error,
          })
          return
        }

        if (record.error) {
          useAgentStore.setState({ error: record.error, isSending: false })
          return
        }

        if (record.type === 'tool_result' && record.toolName === 'mindmap_insert_nodes') {
          const params = normalizeMindMapInsertNodesParams(record.params)
          if (!params) {
            useAgentStore.setState({
              error: 'Agent 工具请求格式无效',
              isSending: false,
            })
            return
          }

          const plan = createMindMapInsertPlan(params)
          if (!plan.ok) {
            useAgentStore.setState({
              error: plan.error,
              isSending: false,
            })
            return
          }

          useAgentStore.setState((state) => ({
            messages: appendAssistantMessage(
              state.messages,
              `待确认插入 ${params.nodes.length} 个节点`,
            ),
            pendingPlan: plan.plan,
            error: null,
            isSending: false,
          }))
          return
        }

        if (record.type === 'tool_result' && record.toolName === 'mindmap_update_nodes') {
          handleToolPlanResult(
            record.params,
            normalizeMindMapUpdateNodesParams,
            createMindMapUpdatePlan,
            (params) => `待确认更新 ${params.updates.length} 个节点`,
          )
          return
        }

        if (record.type === 'tool_result' && record.toolName === 'mindmap_move_nodes') {
          handleToolPlanResult(
            record.params,
            normalizeMindMapMoveNodesParams,
            createMindMapMovePlan,
            (params) => `待确认移动 ${params.moves.length} 个节点`,
          )
          return
        }

        if (record.type === 'tool_result' && record.toolName === 'mindmap_delete_nodes') {
          handleToolPlanResult(
            record.params,
            normalizeMindMapDeleteNodesParams,
            createMindMapDeletePlan,
            (params) => `待确认删除 ${params.deletes.length} 个节点`,
          )
          return
        }

        if (record.message?.errorMessage) {
          useAgentStore.setState({ error: record.message.errorMessage, isSending: false })
          return
        }

        const finalMessageText = extractAssistantMessageText(record)
        if (finalMessageText) {
          const parsed = parseAgentResponseText(
            finalMessageText,
            useDocumentStore.getState().currentDoc,
          )
          if (parsed.kind === 'plan') {
            streamedAgentText = ''
            isStreamingStructuredPlan = false
            useAgentStore.setState({ pendingPlan: parsed.plan, error: null, isSending: false })
            return
          }

          if (parsed.kind === 'message') {
            const shouldHideStructuredText = parsed.warning
              && looksLikeStructuredAgentOutput(parsed.text)
            streamedAgentText = ''
            isStreamingStructuredPlan = false
            useAgentStore.setState((state) => {
              const messages = shouldHideStructuredText
                ? state.messages
                : appendAssistantMessage(state.messages, parsed.text)
              return {
                messages,
                error: parsed.warning ?? null,
                isSending: false,
              }
            })
            return
          }
        }

        const delta = extractAssistantTextDelta(record)
        if (!delta) return

        streamedAgentText += delta
        if (isStreamingStructuredPlan || looksLikeStructuredAgentOutput(streamedAgentText)) {
          isStreamingStructuredPlan = true
          return
        }

        useAgentStore.setState((state) => {
          return { messages: appendAssistantMessage(state.messages, delta) }
        })
      } catch (error) {
        useAgentStore.setState({ error: `Agent 事件解析失败: ${String(error)}` })
      }
    },
  })
}

setInternalHandler()

function createMessage(role: AgentChatMessage['role'], text: string): AgentChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    createdAt: Date.now(),
  }
}

function extractAssistantTextDelta(record: AgentRpcEventRecord): string {
  if (record.assistantMessageEvent?.type === 'text_delta') {
    return record.assistantMessageEvent.delta ?? ''
  }

  if (record.assistantMessageEvent?.type === 'text_end') {
    const content = record.assistantMessageEvent.content ?? ''
    if (isStreamingStructuredPlan || looksLikeStructuredAgentOutput(content)) {
      streamedAgentText = ''
      return content
    }
  }

  return ''
}

function extractAssistantMessageText(record: AgentRpcEventRecord): string {
  if (record.type !== 'message_end' && record.type !== 'turn_end') return ''
  if (record.message?.role && record.message.role !== 'assistant') return ''

  const content = record.message?.content ?? []
  return content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')
}

function appendAssistantMessage(
  messages: AgentChatMessage[],
  text: string,
): AgentChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant') {
    return [
      ...messages.slice(0, -1),
      { ...last, text: `${last.text}${text}` },
    ]
  }

  return [...messages, createMessage('assistant', text)]
}

function normalizeMindMapInsertNodesParams(value: unknown): AgentMindMapInsertNodesParams | null {
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

function normalizeMindMapUpdateNodesParams(value: unknown): AgentMindMapUpdateNodesParams | null {
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

function normalizeMindMapMoveNodesParams(value: unknown): AgentMindMapMoveNodesParams | null {
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

function normalizeMindMapDeleteNodesParams(value: unknown): AgentMindMapDeleteNodesParams | null {
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

function handleToolPlanResult<TParams>(
  rawParams: unknown,
  normalize: (value: unknown) => TParams | null,
  createPlan: (params: TParams) => { ok: true; plan: AgentChangePlan } | { ok: false; error: string },
  getMessage: (params: TParams) => string,
): void {
  const params = normalize(rawParams)
  if (!params) {
    useAgentStore.setState({
      error: 'Agent 工具请求格式无效',
      isSending: false,
    })
    return
  }

  const plan = createPlan(params)
  if (!plan.ok) {
    useAgentStore.setState({
      error: plan.error,
      isSending: false,
    })
    return
  }

  const message = getMessage(params)
  useAgentStore.setState((state) => ({
    messages: appendAssistantMessage(state.messages, message),
    pendingPlan: plan.plan,
    error: null,
    isSending: false,
  }))
}

function createMindMapInsertPlan(
  params: AgentMindMapInsertNodesParams,
): { ok: true; plan: AgentChangePlan } | { ok: false; error: string } {
  const currentDoc = useDocumentStore.getState().currentDoc
  if (!currentDoc) return { ok: false, error: '当前没有可修改的文档' }
  if (params.documentId !== currentDoc.id) {
    return { ok: false, error: 'Agent 工具请求不属于当前文档' }
  }

  const context = createAgentDocumentContext(currentDoc)
  if (params.snapshotKey !== context.snapshotKey) {
    return { ok: false, error: '当前文档已变化，请让助理重新生成节点' }
  }
  if (params.nodes.length === 0) {
    return { ok: false, error: 'Agent 工具请求没有包含节点' }
  }

  const insertedNodes = params.nodes
    .map(createInsertedNodeFromMindMapInput)
    .filter((node): node is AgentInsertedNode => node !== null)
  if (insertedNodes.length !== params.nodes.length) {
    return { ok: false, error: 'Agent 工具请求包含空节点标题' }
  }

  const parentNode = findNodeById(currentDoc.root, params.parentNodeId)
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

function createMindMapUpdatePlan(
  params: AgentMindMapUpdateNodesParams,
): { ok: true; plan: AgentChangePlan } | { ok: false; error: string } {
  const validation = validateToolDocumentContext(params)
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

function createMindMapMovePlan(
  params: AgentMindMapMoveNodesParams,
): { ok: true; plan: AgentChangePlan } | { ok: false; error: string } {
  const validation = validateToolDocumentContext(params)
  if (!validation.ok) return validation
  if (params.moves.length === 0) {
    return { ok: false, error: 'Agent 工具请求没有包含节点移动' }
  }

  for (const move of params.moves) {
    if (!findNodeById(validation.doc.root, move.nodeId)) {
      return { ok: false, error: `节点不存在: ${move.nodeId}` }
    }
    const targetParent = findNodeById(validation.doc.root, move.targetParentNodeId)
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

function createMindMapDeletePlan(
  params: AgentMindMapDeleteNodesParams,
): { ok: true; plan: AgentChangePlan } | { ok: false; error: string } {
  const validation = validateToolDocumentContext(params)
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

function validateToolDocumentContext(params: {
  documentId: string
  snapshotKey: string
}): { ok: true; doc: NonNullable<ReturnType<typeof useDocumentStore.getState>['currentDoc']> } | { ok: false; error: string } {
  const currentDoc = useDocumentStore.getState().currentDoc
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

function findNodeById(root: OutlineNode, nodeId: string): OutlineNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children) {
    const result = findNodeById(child, nodeId)
    if (result) return result
  }
  return null
}

function findNodePath(root: OutlineNode, nodeId: string, path: string[] = []): string[] | null {
  if (root.id === nodeId) return path
  for (const child of root.children) {
    const result = findNodePath(child, nodeId, [...path, child.text])
    if (result) return result
  }
  return null
}

function createCurrentDocumentReferences(
  doc: NonNullable<ReturnType<typeof useDocumentStore.getState>['currentDoc']>,
  nodeIds: string[],
): AgentChangePlan['references'] {
  const references: AgentChangePlan['references'] = []
  for (const nodeId of new Set(nodeIds)) {
    const node = findNodeById(doc.root, nodeId)
    if (!node) continue
    references.push({
      sourceType: 'currentDocument',
      documentId: doc.id,
      documentTitle: doc.title,
      nodeId,
      path: findNodePath(doc.root, nodeId) ?? [node.text],
      snippet: node.text,
    })
  }
  return references
}

function createInsertedNodeFromMindMapInput(input: AgentMindMapNodeInput): AgentInsertedNode | null {
  const text = input.text.trim()
  if (!text) return null

  const children = (input.children ?? []).map(createInsertedNodeFromMindMapInput)
  if (children.some((node) => node === null)) return null

  return {
    id: generateId(),
    text,
    note: input.note,
    tags: input.tags,
    checked: input.checked,
    children: children.filter((node): node is AgentInsertedNode => node !== null),
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
