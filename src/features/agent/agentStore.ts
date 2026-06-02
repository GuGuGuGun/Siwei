import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'

import { createAgentDocumentContext } from './agentChangePlan'
import type {
  AgentChangePlan,
  AgentChatMessage,
  AgentStatus,
} from './agentTypes'
import {
  createAgentChatMessage,
  createAgentRpcEventHandler,
} from './agentEventHandler'
import { describeAppliedPlan } from './agentToolPlanFactory'
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
let statusPollTimer: number | null = null
const handledEventIds = new Set<number>()

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
    const userMessage = createAgentChatMessage('user', trimmed)

    set((state) => ({
      messages: [...state.messages, userMessage],
      isSending: true,
      error: null,
      pendingPlan: null,
    }))

    try {
      await api.agentStartSession(sessionKey)
      await api.agentSendMessage(trimmed, context)
      const status = await api.agentGetStatus()
      processStatusEvents(status)
      set({
        status,
        isSending: status.streaming,
        error: status.error,
      })
      startStatusPolling()
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
    stopStatusPolling()
  },

  setPendingPlan: (pendingPlan) => set({ pendingPlan, error: null }),

  rejectPendingPlan: () => set({ pendingPlan: null }),

  applyPendingPlan: () => {
    const plan = get().pendingPlan
    if (!plan) return { ok: false, error: '没有可应用的修改计划' }

    const result = useDocumentStore.getState().applyAgentChangePlan(plan)
    if (result.ok) {
      set((state) => ({
        messages: [...state.messages, createAgentChatMessage('assistant', describeAppliedPlan(plan))],
        pendingPlan: null,
        error: null,
      }))
      return { ok: true }
    }

    set({ error: result.error })
    return result
  },

  attachEventListeners: async () => {
    if (eventsAttached || !('__TAURI_INTERNALS__' in window)) return
    eventsAttached = true

    await listen<string>('agent://event', (event) => {
      handleEventPayload(event.payload)
    })
    await listen<string>('agent://error', (event) => {
      set({ error: event.payload, isSending: false })
    })
  },
}))

const setInternalHandler = () => {
  useAgentStore.setState({
    handleRpcEvent: createAgentRpcEventHandler({
      getCurrentDoc: () => useDocumentStore.getState().currentDoc,
      getPendingPlan: () => useAgentStore.getState().pendingPlan,
      setAgentState: (next) => useAgentStore.setState(next),
    }),
  })
}

setInternalHandler()

function handleEventPayload(payload: string): void {
  markEventHandled(payload)
  useAgentStore.getState().handleRpcEvent?.(payload)
}

function markEventHandled(payload: string): void {
  try {
    const record = JSON.parse(payload) as { eventId?: unknown }
    if (typeof record.eventId === 'number') {
      handledEventIds.add(record.eventId)
    }
  } catch {
    // 非 JSON payload 会交给原事件处理器报错，这里只负责事件去重。
  }
}

function processStatusEvents(status: AgentStatus): void {
  status.events.forEach((event) => {
    if (handledEventIds.has(event.id)) return
    handledEventIds.add(event.id)
    useAgentStore.getState().handleRpcEvent?.(event.payload)
  })
}

function startStatusPolling(): void {
  if (statusPollTimer !== null) return

  statusPollTimer = window.setInterval(() => {
    void pollAgentStatus()
  }, 700)
}

function stopStatusPolling(): void {
  if (statusPollTimer === null) return

  window.clearInterval(statusPollTimer)
  statusPollTimer = null
}

async function pollAgentStatus(): Promise<void> {
  try {
    const status = await api.agentGetStatus()
    processStatusEvents(status)
    useAgentStore.setState({
      status,
      isSending: status.streaming,
      error: status.error,
    })
    if (!status.streaming) {
      stopStatusPolling()
    }
  } catch (error) {
    stopStatusPolling()
    useAgentStore.setState({
      isSending: false,
      error: String(error),
    })
  }
}
