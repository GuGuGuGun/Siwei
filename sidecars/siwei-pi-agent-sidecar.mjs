import { Agent } from '@earendil-works/pi-agent-core'

const SYSTEM_PROMPT = [
  '你是 Siwei 文档助理，定位是受控编辑型助理。',
  '你只能修改宿主应用注入的当前文档，不能修改文档库中的其他文档。',
  '你可以调用只读工具查看文档库索引或搜索文档库，工具结果只能作为引用上下文。',
  '如果用户询问内容，直接用自然语言回答。',
  '如果用户要求生成或修改思维导图节点，优先调用 mindmap_insert_nodes 工具，不要输出 JSON 修改计划。',
  'mindmap_insert_nodes 只能写入当前文档；documentId 和 snapshotKey 必须来自宿主注入的当前文档上下文。',
  '如果工具调用成功，可以用一句自然语言说明已生成节点。',
  '只有在工具不可用时，才输出严格 JSON 修改计划，不要使用 Markdown 代码块或额外解释。',
  '修改 JSON 必须包含 schemaVersion、contextScope、documentId、snapshotKey、summary、rationale、riskLevel、references、operations。',
  'schemaVersion 固定为 1，contextScope 固定为 currentDocument，riskLevel 只能是 low、medium、high。',
  'references 支持 currentDocument 与 librarySearch，字段为 sourceType、documentId、documentTitle、documentPath、nodeId、path、snippet。',
  'operations 仅允许 updateNode、insertNode、deleteNode、moveNode。',
  'operations 的字段名必须严格使用：updateNode.nodeId/text/note/tags/checked，insertNode.parentNodeId/index/node，deleteNode.nodeId，moveNode.nodeId/targetParentNodeId/index。',
  '禁止使用 parentId、targetParentId 或其他别名。',
  '不要自动应用修改，Siwei 会在图内预览并等待用户确认。',
].join('\n')

let agent = null
let runtimeConfig = null
let buffer = ''
let rpcSequence = 0
const pendingRpcRequests = new Map()

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  while (true) {
    const newlineIndex = buffer.indexOf('\n')
    if (newlineIndex === -1) break

    const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
    buffer = buffer.slice(newlineIndex + 1)
    if (line.trim()) {
      void handleLine(line)
    }
  }
})

process.on('uncaughtException', (error) => {
  writeJson({
    type: 'response',
    command: 'runtime',
    success: false,
    error: normalizeError(error),
  })
})

process.on('unhandledRejection', (error) => {
  writeJson({
    type: 'response',
    command: 'runtime',
    success: false,
    error: normalizeError(error),
  })
})

async function handleLine(line) {
  let command
  try {
    command = JSON.parse(line)
  } catch (error) {
    writeJson({
      type: 'response',
      command: 'parse',
      success: false,
      error: `Agent RPC 行解析失败: ${normalizeError(error)}`,
    })
    return
  }

  try {
    if (command.jsonrpc === '2.0' && !command.method) {
      resolveRpcResponse(command)
      return
    }

    if (command.jsonrpc === '2.0' && command.method) {
      await handleJsonRpcRequest(command)
      return
    }

    if (command.type === 'configure') {
      configureRuntime(command)
      writeJson({ id: command.id, type: 'response', command: 'configure', success: true })
      return
    }

    if (command.type === 'prompt') {
      const currentAgent = ensureAgent()
      writeJson({ id: command.id, type: 'response', command: 'prompt', success: true })
      await currentAgent.prompt(String(command.message ?? ''))
      return
    }

    if (command.type === 'abort') {
      agent?.abort()
      writeJson({ id: command.id, type: 'response', command: 'abort', success: true })
      return
    }

    if (command.type === 'get_state') {
      writeJson({
        id: command.id,
        type: 'response',
        command: 'get_state',
        success: true,
        data: getState(),
      })
      return
    }

    writeJson({
      id: command.id,
      type: 'response',
      command: command.type ?? 'unknown',
      success: false,
      error: `不支持的 Agent RPC 命令: ${String(command.type)}`,
    })
  } catch (error) {
    writeJson({
      id: command.id,
      type: 'response',
      command: command.type ?? 'unknown',
      success: false,
      error: normalizeError(error),
    })
  }
}

async function handleJsonRpcRequest(command) {
  try {
    if (command.method === 'agent.configure') {
      configureRuntime(command.params ?? {})
      writeRpcResult(command.id, { ok: true })
      return
    }

    if (command.method === 'agent.prompt') {
      const currentAgent = ensureAgent()
      writeRpcResult(command.id, { ok: true })
      await currentAgent.prompt(buildPrompt(command.params ?? {}))
      return
    }

    if (command.method === 'agent.abort') {
      agent?.abort()
      writeRpcResult(command.id, { ok: true })
      return
    }

    if (command.method === 'agent.getState') {
      writeRpcResult(command.id, getState())
      return
    }

    writeRpcError(command.id, `不支持的 Agent RPC 方法: ${String(command.method)}`)
  } catch (error) {
    writeRpcError(command.id, normalizeError(error))
  }
}

function configureRuntime(command) {
  const nextConfig = {
    provider: requireString(command.provider, 'provider'),
    model: requireString(command.model, 'model'),
    baseUrl: requireString(command.baseUrl, 'baseUrl'),
    thinkingLevel: normalizeThinkingLevel(command.thinkingLevel),
    apiKey: requireString(command.apiKey, 'apiKey'),
  }

  const sameConfig = runtimeConfig
    && runtimeConfig.provider === nextConfig.provider
    && runtimeConfig.model === nextConfig.model
    && runtimeConfig.baseUrl === nextConfig.baseUrl
    && runtimeConfig.thinkingLevel === nextConfig.thinkingLevel
    && runtimeConfig.apiKey === nextConfig.apiKey

  runtimeConfig = nextConfig
  if (!sameConfig) {
    agent?.abort()
    agent = null
  }
}

function ensureAgent() {
  if (!runtimeConfig) {
    throw new Error('Agent runtime 尚未配置')
  }

  if (agent) return agent

  agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: createModel(runtimeConfig),
      thinkingLevel: runtimeConfig.thinkingLevel,
      tools: createHostTools(),
      messages: [],
    },
    getApiKey: (provider) => (provider === runtimeConfig.provider ? runtimeConfig.apiKey : undefined),
    beforeToolCall: async ({ toolCall }) => {
      const allowedToolNames = new Set(['library_list', 'library_search', 'mindmap_insert_nodes'])
      if (allowedToolNames.has(toolCall.name)) return undefined
      return {
        block: true,
        reason: 'Siwei 文档助理只允许调用文档库只读工具和当前思维导图写入工具',
      }
    },
    toolExecution: 'sequential',
    transport: 'auto',
    maxRetryDelayMs: 30000,
  })
  agent.subscribe((event) => {
    writeJson(event)
  })
  return agent
}

function createHostTools() {
  return [
    {
      name: 'mindmap_insert_nodes',
      label: '生成思维导图节点',
      description: '向当前 Siwei 思维导图插入一个或多个节点。只能写入当前文档，插入后由宿主应用负责生成节点 ID、记录撤销历史和标记未保存。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['documentId', 'snapshotKey', 'parentNodeId', 'nodes'],
        properties: {
          documentId: {
            type: 'string',
            description: '当前文档 ID，必须来自宿主注入的 documentContext.documentId。',
          },
          snapshotKey: {
            type: 'string',
            description: '当前文档快照，必须来自宿主注入的 documentContext.snapshotKey。',
          },
          parentNodeId: {
            type: 'string',
            description: '要插入到其下方的父节点 ID，必须来自当前文档上下文。',
          },
          index: {
            type: 'number',
            description: '插入位置，从 0 开始；省略时追加到父节点末尾。',
          },
          nodes: {
            type: 'array',
            minItems: 1,
            description: '要生成的节点树。',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text'],
              properties: {
                text: {
                  type: 'string',
                  description: '节点标题。',
                },
                note: {
                  type: 'string',
                  description: '可选备注。',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '可选标签。',
                },
                checked: {
                  type: 'boolean',
                  description: '可选任务状态。',
                },
                children: {
                  type: 'array',
                  description: '子节点树。',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['text'],
                    properties: {
                      text: { type: 'string' },
                      note: { type: 'string' },
                      tags: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      checked: { type: 'boolean' },
                      children: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      execute: async (_toolCallId, params, signal) => {
        const result = await requestHostTool('mindmap.insertNodes', {
          documentId: params.documentId,
          snapshotKey: params.snapshotKey,
          parentNodeId: params.parentNodeId,
          index: params.index,
          nodes: params.nodes,
        }, signal)
        return textToolResult(result)
      },
      executionMode: 'sequential',
    },
    {
      name: 'library_list',
      label: '读取文档库索引',
      description: '读取当前文档库中的轻量文档索引，只能作为引用上下文，不能修改文档。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: {
            type: 'number',
            description: '最多返回多少篇文档，默认 20，最大 50。',
          },
        },
      },
      execute: async (_toolCallId, params, signal) => {
        const result = await requestHostTool('library.list', {
          limit: params.limit,
        }, signal)
        return textToolResult(result)
      },
      executionMode: 'sequential',
    },
    {
      name: 'library_search',
      label: '搜索文档库',
      description: '搜索当前文档库，返回裁剪后的节点引用，只能作为当前文档编辑计划的引用来源。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词。',
          },
          limit: {
            type: 'number',
            description: '最多返回多少条引用，默认 8，最大 20。',
          },
        },
      },
      execute: async (_toolCallId, params, signal) => {
        const result = await requestHostTool('library.search', {
          query: params.query,
          limit: params.limit,
        }, signal)
        return textToolResult(result)
      },
      executionMode: 'sequential',
    },
  ]
}

function buildPrompt(params) {
  const message = String(params.message ?? '')
  const documentContext = params.documentContext ?? {}
  return [
    message,
    '',
    '当前 Siwei 文档上下文如下。只能对该 JSON 中的 documentId 生成修改计划。',
    '如果需要使用文档库信息，只能先调用 library_list 或 library_search 获取引用上下文。',
    '修改计划必须是严格 JSON，不能包含 Markdown 代码块或额外解释。',
    JSON.stringify(documentContext),
  ].join('\n')
}

function requestHostTool(method, params, signal) {
  if (signal?.aborted) return Promise.reject(new Error('工具调用已取消'))

  const id = `tool-${Date.now()}-${++rpcSequence}`
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  }

  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      pendingRpcRequests.delete(id)
      reject(new Error('工具调用已取消'))
    }

    pendingRpcRequests.set(id, { resolve, reject, abortHandler })
    signal?.addEventListener('abort', abortHandler, { once: true })
    writeJson(request)
  })
}

function resolveRpcResponse(response) {
  const pending = pendingRpcRequests.get(response.id)
  if (!pending) return

  pendingRpcRequests.delete(response.id)
  pending.abortHandler && removeAbortListeners(pending.abortHandler)
  if (response.error) {
    pending.reject(new Error(response.error.message ?? '宿主工具调用失败'))
  } else {
    pending.resolve(response.result)
  }
}

function removeAbortListeners() {
  // AbortSignal does not require explicit cleanup for once listeners in this runtime path.
}

function textToolResult(details) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(details),
      },
    ],
    details,
  }
}

function createModel(config) {
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: config.provider,
    baseUrl: config.baseUrl,
    reasoning: config.thinkingLevel !== 'off',
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  }
}

function getState() {
  return {
    isStreaming: agent?.state.isStreaming ?? false,
    sessionId: agent?.sessionId ?? null,
    sessionFile: null,
    model: runtimeConfig ? `${runtimeConfig.provider}/${runtimeConfig.model}` : null,
    thinkingLevel: runtimeConfig?.thinkingLevel ?? null,
    messageCount: agent?.state.messages.length ?? 0,
  }
}

function normalizeThinkingLevel(value) {
  const normalized = String(value ?? 'medium').trim()
  return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(normalized)
    ? normalized
    : 'medium'
}

function requireString(value, field) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${field} 不能为空`)
  }
  return normalized
}

function normalizeError(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function writeRpcResult(id, result) {
  writeJson({
    jsonrpc: '2.0',
    id,
    result,
  })
}

function writeRpcError(id, message) {
  writeJson({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message,
    },
  })
}
