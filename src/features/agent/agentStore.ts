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
    handleRpcEvent: createAgentRpcEventHandler({
      getCurrentDoc: () => useDocumentStore.getState().currentDoc,
      getPendingPlan: () => useAgentStore.getState().pendingPlan,
      setAgentState: (next) => useAgentStore.setState(next),
    }),
  })
}

setInternalHandler()
