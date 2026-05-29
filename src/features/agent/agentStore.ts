import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'

import { createAgentDocumentContext } from './agentChangePlan'
import type {
  AgentChangePlan,
  AgentChatMessage,
  AgentMindMapInsertNodesParams,
  AgentRpcEventRecord,
  AgentStatus,
} from './agentTypes'
import {
  looksLikeStructuredAgentOutput,
  parseAgentResponseText,
} from './agentPlanParser'
import { useDocumentStore } from '../document/documentStore'
import * as api from '../../services/siweiApi'

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

          const result = useDocumentStore.getState().insertAgentMindMapNodes(params)
          if (result.ok) {
            useAgentStore.setState((state) => ({
              messages: appendAssistantMessage(
                state.messages,
                `已插入 ${result.insertedNodeIds.length} 个节点`,
              ),
              pendingPlan: null,
              error: null,
              isSending: false,
            }))
          } else {
            useAgentStore.setState({
              error: result.error,
              isSending: false,
            })
          }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
