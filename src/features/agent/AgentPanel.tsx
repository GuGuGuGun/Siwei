import React from 'react'
import { Bot, Check, FileSearch, Loader2, Send, Square, X } from 'lucide-react'

import { toast } from '../../components/common/Toast'
import { useDocumentStore } from '../document/documentStore'
import { useAgentStore } from './agentStore'
import type { AgentOperation } from './agentTypes'

export const AgentPanel: React.FC = () => {
  const currentDoc = useDocumentStore((state) => state.currentDoc)
  const isSending = useAgentStore((state) => state.isSending)
  const messages = useAgentStore((state) => state.messages)
  const pendingPlan = useAgentStore((state) => state.pendingPlan)
  const error = useAgentStore((state) => state.error)
  const sendMessage = useAgentStore((state) => state.sendMessage)
  const abort = useAgentStore((state) => state.abort)
  const setOpen = useAgentStore((state) => state.setOpen)
  const rejectPendingPlan = useAgentStore((state) => state.rejectPendingPlan)
  const applyPendingPlan = useAgentStore((state) => state.applyPendingPlan)
  const attachEventListeners = useAgentStore((state) => state.attachEventListeners)
  const [message, setMessage] = React.useState('')

  React.useEffect(() => {
    void attachEventListeners()
  }, [attachEventListeners])

  const handleSend = async () => {
    try {
      await sendMessage(message)
      setMessage('')
    } catch (sendError) {
      toast.error(`助理发送失败: ${String(sendError)}`)
    }
  }

  const handleApplyPlan = () => {
    const result = applyPendingPlan()
    if (result.ok) {
      toast.success('助理修改已应用')
    } else {
      toast.error(result.error)
    }
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-zinc-200 bg-white text-zinc-800 shadow-sm">
      <header className="flex h-12 items-center justify-between border-b border-zinc-200 px-4">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-zinc-700" />
          <h2 className="text-sm font-semibold">文档助理</h2>
          {isSending && <Loader2 size={13} className="animate-spin text-zinc-400" />}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
          title="关闭助理"
        >
          <X size={15} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
          {currentDoc ? `当前文档：${currentDoc.title || '未命名文档'}` : '当前没有打开的文档'}
        </div>

        <div className="space-y-2">
          {messages.map((item) => (
            <div
              key={item.id}
              className={`rounded-md px-3 py-2 text-xs leading-5 ${
                item.role === 'user'
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600'
              }`}
            >
              {item.text}
            </div>
          ))}
          {messages.length === 0 && (
            <div className="rounded-md border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-400">
              使用第三方模型处理当前文档，修改会先在图里预览。
            </div>
          )}
        </div>

        {pendingPlan && (
          <section className="mt-4 rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-800">
                  {pendingPlan.summary || `将更改 ${pendingPlan.operations.length} 个节点`}
                </div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  {pendingPlan.rationale || '更改会先在当前图里预览，应用后可用撤销回退。'}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-400">
                  将更改 {pendingPlan.operations.length} 个节点
                </div>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                pendingPlan.riskLevel === 'high'
                  ? 'bg-rose-50 text-rose-600'
                  : pendingPlan.riskLevel === 'medium'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
              }`}
              >
                {riskText[pendingPlan.riskLevel]}
              </span>
            </div>

            <div className="mt-3 border-t border-zinc-100 pt-3">
              <div className="mb-2 text-[11px] font-medium text-zinc-500">操作清单</div>
              <div className="space-y-1.5">
                {pendingPlan.operations.map((operation, index) => (
                  <div
                    key={`${operation.type}-${index}`}
                    className="rounded border border-zinc-100 bg-zinc-50 px-2.5 py-2 text-xs leading-5 text-zinc-600"
                  >
                    <span className="font-medium text-zinc-800">{operationTypeText[operation.type]}</span>
                    <span className="ml-1">{describeOperation(operation)}</span>
                  </div>
                ))}
              </div>
            </div>

            {pendingPlan.references.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                  <FileSearch size={12} />
                  引用来源
                </div>
                <div className="space-y-1.5">
                  {pendingPlan.references.map((reference, index) => (
                    <div
                      key={`${reference.sourceType}-${reference.documentId}-${reference.nodeId ?? index}`}
                      className="rounded border border-zinc-100 px-2.5 py-2 text-xs leading-5 text-zinc-500"
                    >
                      <div className="font-medium text-zinc-700">
                        {reference.documentTitle || reference.documentId}
                      </div>
                      {reference.snippet && (
                        <div className="mt-0.5 max-h-10 overflow-hidden">{reference.snippet}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleApplyPlan}
                className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
              >
                <Check size={13} />
                应用修改
              </button>
              <button
                type="button"
                onClick={rejectPendingPlan}
                className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                拒绝
              </button>
            </div>
          </section>
        )}

        <section className="mt-4">
          {error && <div className="mt-2 text-xs leading-5 text-rose-500">{error}</div>}
        </section>
      </div>

      <footer className="border-t border-zinc-200 p-3">
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder="询问当前文档"
            disabled={!currentDoc || isSending}
            className="h-9 min-w-0 flex-1 rounded-md border border-zinc-200 px-3 text-xs outline-none focus:border-zinc-400 disabled:opacity-50"
          />
          {isSending ? (
            <button
              type="button"
              onClick={() => void abort()}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              title="停止"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!currentDoc || !message.trim()}
              className="flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={13} />
              发送
            </button>
          )}
        </div>
      </footer>
    </aside>
  )
}

const riskText = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

const operationTypeText = {
  updateNode: '更新',
  insertNode: '插入',
  deleteNode: '删除',
  moveNode: '移动',
}

function describeOperation(operation: AgentOperation): string {
  switch (operation.type) {
    case 'updateNode':
      return operation.text ? `节点 ${operation.nodeId} 为「${operation.text}」` : `节点 ${operation.nodeId}`
    case 'insertNode':
      return `到 ${operation.parentNodeId} 的第 ${operation.index + 1} 位：「${operation.node.text}」`
    case 'deleteNode':
      return `节点 ${operation.nodeId}`
    case 'moveNode':
      return `节点 ${operation.nodeId} 到 ${operation.targetParentNodeId} 的第 ${operation.index + 1} 位`
    default: {
      const unreachable: never = operation
      return String(unreachable)
    }
  }
}
