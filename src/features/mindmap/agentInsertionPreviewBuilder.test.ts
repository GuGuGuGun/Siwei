import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../types/document'
import type { AgentInsertionPreview } from '../agent/agentTypes'
import { outlineToGraph } from './outlineToGraph'
import {
  attachAgentInsertionPreviewGraphData,
  createAgentInsertionNodeId,
  createAgentInsertionPreviewRoot,
  isAgentInsertionNodeId,
} from './agentInsertionPreviewBuilder'

function node(id: string, children: OutlineNode[] = []): OutlineNode {
  return {
    id,
    text: id,
    createdAt: 1,
    updatedAt: 1,
    children,
  }
}

describe('agentInsertionPreviewBuilder', () => {
  it('builds a transient tree with nested inserted preview nodes', () => {
    const root = node('root', [node('a'), node('b')])
    const insertions = new Map<string, AgentInsertionPreview[]>([
      ['root', [
        {
          index: 1,
          node: {
            id: 'agent-1',
            text: '新增分支',
            children: [{ id: 'agent-1-1', text: '嵌套节点' }],
          },
        },
      ]],
      ['agent-1', [
        {
          index: 1,
          node: { id: 'agent-1-2', text: '追加嵌套' },
        },
      ]],
    ])

    const previewRoot = createAgentInsertionPreviewRoot(root, insertions)

    expect(previewRoot.children.map((child) => child.id)).toEqual([
      'a',
      createAgentInsertionNodeId('agent-1'),
      'b',
    ])
    expect(previewRoot.children[1].children.map((child) => child.id)).toEqual([
      createAgentInsertionNodeId('agent-1-1'),
      createAgentInsertionNodeId('agent-1-2'),
    ])
    expect(root.children.map((child) => child.id)).toEqual(['a', 'b'])
  })

  it('attaches preview metadata and dashed edge styling to generated graph nodes', () => {
    const root = createAgentInsertionPreviewRoot(node('root'), new Map([
      ['root', [{ index: 0, node: { id: 'agent-1', text: '新增分支' } }]],
    ]))
    const graph = outlineToGraph(root, new Set())
    const attached = attachAgentInsertionPreviewGraphData(graph, new Map([
      ['root', [{ index: 0, node: { id: 'agent-1', text: '新增分支' } }]],
    ]))
    const previewNodeId = createAgentInsertionNodeId('agent-1')

    expect(isAgentInsertionNodeId(previewNodeId)).toBe(true)
    expect(attached.nodes.find((item) => item.id === previewNodeId)?.data).toMatchObject({
      label: '新增分支',
      agentInsertionDepth: 1,
    })
    expect(attached.edges.find((edge) => edge.target === previewNodeId)?.style).toMatchObject({
      stroke: '#059669',
      strokeDasharray: '4 4',
    })
  })
})
