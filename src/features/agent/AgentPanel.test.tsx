import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocument } from '../../test/fixtures'
import { useDocumentStore } from '../document/documentStore'
import { useAgentStore } from './agentStore'
import { AgentPanel } from './AgentPanel'
import * as api from '../../services/siweiApi'

vi.mock('../../services/siweiApi', () => ({
  agentGetStatus: vi.fn(),
  agentStartSession: vi.fn(),
  agentSendMessage: vi.fn(),
  agentAbort: vi.fn(),
}))

const apiMock = vi.mocked(api)

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAgentStore.setState({
      isOpen: true,
      isSending: false,
      messages: [],
      pendingPlan: null,
      status: null,
      error: null,
    })
    useDocumentStore.setState({
      currentDoc: createDocument(),
      currentFilePath: 'demo.siwei.json',
      isDirty: false,
      selectedNodeId: 'node-2',
      collapsedNodeIds: new Set<string>(),
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
    })
    apiMock.agentGetStatus.mockResolvedValue({
      available: true,
      running: true,
      streaming: false,
      sessionKey: 'demo.siwei.json',
      model: 'gpt-4.1',
      error: null,
    })
    apiMock.agentStartSession.mockResolvedValue(undefined)
    apiMock.agentSendMessage.mockResolvedValue(undefined)
    apiMock.agentAbort.mockResolvedValue(undefined)
  })

  it('sends the current document context through the agent API', async () => {
    apiMock.agentGetStatus.mockResolvedValue({
      available: true,
      running: true,
      streaming: true,
      sessionKey: 'demo.siwei.json',
      model: 'gpt-4.1',
      error: null,
    })
    render(<AgentPanel />)

    fireEvent.change(screen.getByPlaceholderText('询问当前文档'), {
      target: { value: '总结当前文档' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(apiMock.agentStartSession).toHaveBeenCalledWith('demo.siwei.json')
      expect(apiMock.agentSendMessage).toHaveBeenCalledWith(
        '总结当前文档',
        expect.objectContaining({
          documentId: 'doc-1',
          root: expect.objectContaining({ nodeId: 'root' }),
        }),
      )
    })
    expect(screen.queryByText('消息已发送，等待 Agent 返回事件')).not.toBeInTheDocument()
    expect(useAgentStore.getState().isSending).toBe(true)
  })

  it('renders a Notion-style confirmation without exposing raw change plans', () => {
    const doc = useDocumentStore.getState().currentDoc!
    const snapshotKey = JSON.stringify(doc)
    render(<AgentPanel />)

    expect(screen.queryByPlaceholderText('粘贴助理返回的 JSON 修改计划')).not.toBeInTheDocument()

    act(() => {
      useAgentStore.getState().setPendingPlan({
        schemaVersion: 1,
        contextScope: 'currentDocument',
        documentId: doc.id,
        snapshotKey,
        summary: '改写节点',
        rationale: '用户要求调整表达',
        riskLevel: 'low',
        references: [],
        operations: [
          {
            type: 'updateNode',
            nodeId: 'node-2',
            text: '助理改写',
          },
        ],
      })
    })

    expect(screen.getByText('将更改 1 个节点')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '显示更改' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '应用修改' }))

    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('助理改写')
    expect(useDocumentStore.getState().canUndo).toBe(true)
  })

  it('requires a second confirmation before applying high-risk delete plans', () => {
    const doc = useDocumentStore.getState().currentDoc!
    render(<AgentPanel />)

    act(() => {
      useAgentStore.getState().setPendingPlan({
        schemaVersion: 1,
        contextScope: 'currentDocument',
        documentId: doc.id,
        snapshotKey: JSON.stringify(doc),
        summary: '删除过期节点',
        rationale: '用户要求清理重复内容',
        riskLevel: 'high',
        references: [
          {
            sourceType: 'currentDocument',
            documentId: doc.id,
            nodeId: 'node-1',
            path: ['第一节点'],
            snippet: '第一节点',
          },
        ],
        operations: [
          {
            type: 'deleteNode',
            nodeId: 'node-1',
            reason: '清理重复内容',
          },
        ],
      })
    })

    expect(screen.getByText(/删除 1 个子节点/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '应用修改' }))

    const dialog = screen.getByRole('dialog', { name: '确认删除节点' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('第一节点')).toBeInTheDocument()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
    ])

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-2',
    ])
    expect(useDocumentStore.getState().canUndo).toBe(true)
  })

  it('surfaces provider errors emitted in core message events', () => {
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_end',
        message: {
          errorMessage: '401 Incorrect API key provided',
        },
      }))
    })

    expect(screen.getByText('401 Incorrect API key provided')).toBeInTheDocument()
    expect(useAgentStore.getState().isSending).toBe(false)
  })

  it('previews mind map tool calls until the user confirms them', () => {
    const doc = useDocumentStore.getState().currentDoc!
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'tool_result',
        toolName: 'mindmap_insert_nodes',
        params: {
          documentId: doc.id,
          snapshotKey: JSON.stringify(doc),
          parentNodeId: doc.root.id,
          nodes: [
            {
              text: 'Agent 直接生成',
              children: [
                { text: '子节点' },
              ],
            },
          ],
        },
      }))
    })

    expect(useDocumentStore.getState().currentDoc?.root.children).toHaveLength(2)
    expect(screen.getAllByText('待确认插入 1 个节点')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '确认插入' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤回' })).toBeInTheDocument()
    expect(useAgentStore.getState().pendingPlan?.operations[0]).toMatchObject({
      type: 'insertNode',
      parentNodeId: doc.root.id,
    })

    fireEvent.click(screen.getByRole('button', { name: '确认插入' }))

    expect(useDocumentStore.getState().currentDoc?.root.children[2]).toMatchObject({
      text: 'Agent 直接生成',
      children: [
        { text: '子节点' },
      ],
    })
    expect(useDocumentStore.getState().canUndo).toBe(true)
    expect(useAgentStore.getState().pendingPlan).toBeNull()
  })

  it('withdraws mind map tool call previews without changing the document', () => {
    const doc = useDocumentStore.getState().currentDoc!
    render(<AgentPanel />)

    act(() => {
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'tool_result',
        toolName: 'mindmap_insert_nodes',
        params: {
          documentId: doc.id,
          snapshotKey: JSON.stringify(doc),
          parentNodeId: doc.root.id,
          nodes: [
            {
              text: '不应插入',
            },
          ],
        },
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: '撤回' }))

    expect(useDocumentStore.getState().currentDoc?.root.children).toHaveLength(2)
    expect(useDocumentStore.getState().canUndo).toBe(false)
    expect(useAgentStore.getState().pendingPlan).toBeNull()
  })

  it('ignores non-assistant final message events so internal prompts stay hidden', () => {
    const doc = useDocumentStore.getState().currentDoc!
    const internalPrompt = [
      '请你生成一个计算器开发的思维导图',
      '当前 Siwei 文档上下文如下。只能对该 JSON 中的 documentId 生成修改计划。',
      JSON.stringify({
        contextScope: 'currentDocument',
        documentId: doc.id,
        root: { nodeId: doc.root.id, text: doc.root.text },
      }),
    ].join('\n')
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_end',
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: internalPrompt,
            },
          ],
        },
      }))
    })

    expect(screen.queryByText(/当前 Siwei 文档上下文如下/)).not.toBeInTheDocument()
    expect(screen.queryByText(/contextScope/)).not.toBeInTheDocument()
    expect(useAgentStore.getState().messages).toHaveLength(0)
    expect(useAgentStore.getState().isSending).toBe(true)
  })

  it('does not apply legacy operation plans that miss audit fields', () => {
    const doc = useDocumentStore.getState().currentDoc!
    const rawPlan = JSON.stringify({
      documentId: doc.id,
      snapshotKey: JSON.stringify(doc),
      operations: [
        {
          type: 'insertNode',
          parentId: 'node-1',
          index: 0,
          node: {
            id: 'agent-node',
            text: '新增节点',
            children: [],
          },
        },
      ],
    })
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: rawPlan.slice(0, 14),
        },
      }))
    })

    expect(screen.queryByText(/\{"documentId/)).not.toBeInTheDocument()
    expect(screen.queryByText('将更改 1 个节点')).not.toBeInTheDocument()

    act(() => {
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: rawPlan.slice(14),
        },
      }))
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'agent_end',
      }))
    })

    expect(screen.queryByText(/"parentId"/)).not.toBeInTheDocument()
    expect(screen.getByText('未生成可应用修改')).toBeInTheDocument()
    expect(useAgentStore.getState().pendingPlan).toBeNull()
  })

  it('parses strict audited JSON plans from final assistant messages', () => {
    const doc = useDocumentStore.getState().currentDoc!
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_end',
        message: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                schemaVersion: 1,
                contextScope: 'currentDocument',
                documentId: doc.id,
                snapshotKey: JSON.stringify(doc),
                summary: '新增计划',
                rationale: '用户要求补充计划结构',
                riskLevel: 'low',
                references: [
                  {
                    sourceType: 'currentDocument',
                    documentId: doc.id,
                    nodeId: doc.root.id,
                    path: [],
                    snippet: doc.root.text,
                  },
                ],
                operations: [
                  {
                    type: 'insertNode',
                    parentNodeId: doc.root.id,
                    index: 0,
                    node: { id: 'agent-node', text: '计算器开发' },
                  },
                ],
              }),
            },
          ],
        },
      }))
    })

    expect(screen.getByText('将更改 1 个节点')).toBeInTheDocument()
    expect(useAgentStore.getState().pendingPlan?.operations[0]).toMatchObject({
      type: 'insertNode',
      parentNodeId: doc.root.id,
    })
    expect(useAgentStore.getState().pendingPlan).toMatchObject({
      summary: '新增计划',
      riskLevel: 'low',
      references: [{ sourceType: 'currentDocument' }],
    })
  })

  it('converts legacy tree-shaped JSON responses into root insertion previews', () => {
    const doc = useDocumentStore.getState().currentDoc!
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_end',
        message: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                title: '计算器开发',
                children: [
                  { title: '需求分析' },
                  { title: '界面设计' },
                ],
              }),
            },
          ],
        },
      }))
    })

    expect(screen.getByText('将更改 1 个节点')).toBeInTheDocument()
    expect(useAgentStore.getState().pendingPlan).toMatchObject({
      documentId: doc.id,
      operations: [
        {
          type: 'insertNode',
          parentNodeId: doc.root.id,
          node: {
            text: '计算器开发',
            children: [
              { text: '需求分析' },
              { text: '界面设计' },
            ],
          },
        },
      ],
    })
  })

  it('extracts legacy node-wrapped operation objects from streamed text without rendering raw JSON', () => {
    const doc = useDocumentStore.getState().currentDoc!
    const snapshotKey = JSON.stringify(doc)
    const rawOutput = [
      '{"text":"先忽略这个普通片段"},',
      JSON.stringify({
        insertNode: {
          parentNodeId: doc.root.id,
          index: 0,
          text: '计算器开发',
          children: [
            { text: '需求分析' },
            { text: '界面设计' },
          ],
        },
      }),
      ',',
      JSON.stringify({
        insertNode: {
          parentNodeId: doc.root.id,
          index: 1,
          text: '测试计划',
          children: [
            { text: '功能测试' },
          ],
        },
      }),
    ].join('')
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: rawOutput,
        },
      }))
    })

    expect(screen.queryByText(/insertNode/)).not.toBeInTheDocument()

    act(() => {
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'agent_end',
      }))
    })

    expect(screen.getByText('将更改 2 个节点')).toBeInTheDocument()
    expect(useAgentStore.getState().pendingPlan).toMatchObject({
      documentId: doc.id,
      snapshotKey,
      operations: [
        {
          type: 'insertNode',
          parentNodeId: doc.root.id,
          node: {
            text: '计算器开发',
            children: [
              { text: '需求分析' },
              { text: '界面设计' },
            ],
          },
        },
        {
          type: 'insertNode',
          parentNodeId: doc.root.id,
          node: {
            text: '测试计划',
            children: [
              { text: '功能测试' },
            ],
          },
        },
      ],
    })
  })

  it('waits for streamed structured output to finish before converting legacy operation objects', () => {
    const doc = useDocumentStore.getState().currentDoc!
    const firstOperation = JSON.stringify({
      insertNode: {
        parentNodeId: doc.root.id,
        index: 0,
        text: '界面设计',
        children: [
          { text: '显示区与按钮区' },
        ],
      },
    })
    const secondOperation = JSON.stringify({
      insertNode: {
        parentNodeId: doc.root.id,
        index: 1,
        text: '核心逻辑',
        children: [
          { text: '输入处理' },
        ],
      },
    })
    render(<AgentPanel />)

    act(() => {
      useAgentStore.setState({ isSending: true })
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: firstOperation,
        },
      }))
    })

    expect(screen.queryByText('将更改 1 个节点')).not.toBeInTheDocument()
    expect(screen.queryByText(/insertNode/)).not.toBeInTheDocument()

    act(() => {
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: `,${secondOperation}`,
        },
      }))
      useAgentStore.getState().handleRpcEvent?.(JSON.stringify({
        type: 'agent_end',
      }))
    })

    expect(screen.queryByText(/insertNode/)).not.toBeInTheDocument()
    expect(screen.getByText('将更改 2 个节点')).toBeInTheDocument()
    expect(useAgentStore.getState().pendingPlan?.operations).toMatchObject([
      {
        type: 'insertNode',
        parentNodeId: doc.root.id,
        index: 0,
        node: { text: '界面设计' },
      },
      {
        type: 'insertNode',
        parentNodeId: doc.root.id,
        index: 1,
        node: { text: '核心逻辑' },
      },
    ])
  })
})
