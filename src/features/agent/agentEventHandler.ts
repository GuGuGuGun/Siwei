import type { OutlineDocument } from '../../types/document'
import {
  createMindMapDeletePlan,
  createMindMapInsertPlan,
  createMindMapMovePlan,
  createMindMapUpdatePlan,
  normalizeMindMapDeleteNodesParams,
  normalizeMindMapInsertNodesParams,
  normalizeMindMapMoveNodesParams,
  normalizeMindMapUpdateNodesParams,
} from './agentToolPlans'
import type {
  AgentChangePlan,
  AgentChatMessage,
  AgentRpcEventRecord,
} from './agentTypes'
import {
  looksLikeStructuredAgentOutput,
  parseAgentResponseText,
} from './agentPlanParser'

interface AgentEventState {
  messages: AgentChatMessage[]
  pendingPlan: AgentChangePlan | null
  error: string | null
  isSending: boolean
}

interface AgentEventHandlerDeps {
  getCurrentDoc: () => OutlineDocument | null
  getPendingPlan: () => AgentChangePlan | null
  setAgentState: (
    next: Partial<AgentEventState> | ((state: AgentEventState) => Partial<AgentEventState>),
  ) => void
}

export function createAgentChatMessage(
  role: AgentChatMessage['role'],
  text: string,
): AgentChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    createdAt: Date.now(),
  }
}

export function createAgentRpcEventHandler({
  getCurrentDoc,
  getPendingPlan,
  setAgentState,
}: AgentEventHandlerDeps) {
  let streamedAgentText = ''
  let isStreamingStructuredPlan = false

  const resetStructuredStream = () => {
    streamedAgentText = ''
    isStreamingStructuredPlan = false
  }

  const extractAssistantTextDelta = (record: AgentRpcEventRecord): string => {
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

  return (payload: string) => {
    try {
      const record = JSON.parse(payload) as AgentRpcEventRecord
      if (record.type === 'agent_end') {
        if (isStreamingStructuredPlan && streamedAgentText) {
          const parsed = parseAgentResponseText(streamedAgentText, getCurrentDoc())
          resetStructuredStream()

          if (parsed.kind === 'plan') {
            setAgentState({ pendingPlan: parsed.plan, error: null, isSending: false })
            return
          }

          setAgentState({ isSending: false, error: parsed.warning ?? '未生成可应用修改' })
          return
        }

        const shouldReportParseFailure = isStreamingStructuredPlan && !getPendingPlan()
        resetStructuredStream()
        setAgentState((state) => ({
          isSending: false,
          error: shouldReportParseFailure ? '未生成可应用修改' : state.error,
        }))
        return
      }

      if (record.error) {
        setAgentState({ error: record.error, isSending: false })
        return
      }

      if (record.type === 'tool_result' && record.toolName === 'mindmap_insert_nodes') {
        const params = normalizeMindMapInsertNodesParams(record.params)
        if (!params) {
          setAgentState({ error: 'Agent 工具请求格式无效', isSending: false })
          return
        }

        const plan = createMindMapInsertPlan(getCurrentDoc(), params)
        if (!plan.ok) {
          setAgentState({ error: plan.error, isSending: false })
          return
        }

        setAgentState((state) => ({
          messages: appendAssistantMessage(state.messages, `待确认插入 ${params.nodes.length} 个节点`),
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
          (params) => createMindMapUpdatePlan(getCurrentDoc(), params),
          (params) => `待确认更新 ${params.updates.length} 个节点`,
          setAgentState,
        )
        return
      }

      if (record.type === 'tool_result' && record.toolName === 'mindmap_move_nodes') {
        handleToolPlanResult(
          record.params,
          normalizeMindMapMoveNodesParams,
          (params) => createMindMapMovePlan(getCurrentDoc(), params),
          (params) => `待确认移动 ${params.moves.length} 个节点`,
          setAgentState,
        )
        return
      }

      if (record.type === 'tool_result' && record.toolName === 'mindmap_delete_nodes') {
        handleToolPlanResult(
          record.params,
          normalizeMindMapDeleteNodesParams,
          (params) => createMindMapDeletePlan(getCurrentDoc(), params),
          (params) => `待确认删除 ${params.deletes.length} 个节点`,
          setAgentState,
        )
        return
      }

      if (record.message?.errorMessage) {
        setAgentState({ error: record.message.errorMessage, isSending: false })
        return
      }

      const finalMessageText = extractAssistantMessageText(record)
      if (finalMessageText) {
        const parsed = parseAgentResponseText(finalMessageText, getCurrentDoc())
        if (parsed.kind === 'plan') {
          resetStructuredStream()
          setAgentState({ pendingPlan: parsed.plan, error: null, isSending: false })
          return
        }

        if (parsed.kind === 'message') {
          const shouldHideStructuredText = parsed.warning
            && looksLikeStructuredAgentOutput(parsed.text)
          resetStructuredStream()
          setAgentState((state) => ({
            messages: shouldHideStructuredText
              ? state.messages
              : appendAssistantMessage(state.messages, parsed.text),
            error: parsed.warning ?? null,
            isSending: false,
          }))
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

      setAgentState((state) => ({ messages: appendAssistantMessage(state.messages, delta) }))
    } catch (error) {
      setAgentState({ error: `Agent 事件解析失败: ${String(error)}` })
    }
  }
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

  return [...messages, createAgentChatMessage('assistant', text)]
}

function handleToolPlanResult<TParams>(
  rawParams: unknown,
  normalize: (value: unknown) => TParams | null,
  createPlan: (params: TParams) => { ok: true; plan: AgentChangePlan } | { ok: false; error: string },
  getMessage: (params: TParams) => string,
  setAgentState: AgentEventHandlerDeps['setAgentState'],
): void {
  const params = normalize(rawParams)
  if (!params) {
    setAgentState({ error: 'Agent 工具请求格式无效', isSending: false })
    return
  }

  const plan = createPlan(params)
  if (!plan.ok) {
    setAgentState({ error: plan.error, isSending: false })
    return
  }

  setAgentState((state) => ({
    messages: appendAssistantMessage(state.messages, getMessage(params)),
    pendingPlan: plan.plan,
    error: null,
    isSending: false,
  }))
}
