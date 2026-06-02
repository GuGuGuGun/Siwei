import type { Node } from 'reactflow'
import type { OutlineNode } from '../../types/document'
import type { AgentInsertionPreview } from '../agent/agentTypes'
import type { GraphData } from './outlineToGraph'

interface AgentInsertionGraphNodeData {
  agentInsertion?: AgentInsertionPreview
  agentInsertionDepth?: number
}

const AGENT_INSERTION_NODE_PREFIX = 'agent-insertion-preview:'

export function createAgentInsertionPreviewRoot(
  root: OutlineNode,
  insertionsByParentId: Map<string, AgentInsertionPreview[]>,
): OutlineNode {
  const visit = (node: OutlineNode): OutlineNode => {
    const childNodes = node.children.map(visit)

    return {
      ...node,
      children: insertAgentInsertionPreviewChildren(
        childNodes,
        insertionsByParentId.get(node.id) ?? [],
        insertionsByParentId,
      ),
    }
  }

  return visit(root)
}

function createAgentInsertionPreviewOutlineNode(
  insertion: AgentInsertionPreview,
  insertionsByParentId: Map<string, AgentInsertionPreview[]>,
): OutlineNode {
  const now = 0
  const childNodes = (insertion.node.children ?? []).map((child, index) => (
    createAgentInsertionPreviewOutlineNode({ index, node: child }, insertionsByParentId)
  ))

  return {
    id: createAgentInsertionNodeId(insertion.node.id),
    text: insertion.node.text,
    note: insertion.node.note ?? undefined,
    tags: insertion.node.tags,
    checked: insertion.node.checked ?? undefined,
    createdAt: now,
    updatedAt: now,
    children: insertAgentInsertionPreviewChildren(
      childNodes,
      insertionsByParentId.get(insertion.node.id) ?? [],
      insertionsByParentId,
    ),
  }
}

function insertAgentInsertionPreviewChildren(
  children: OutlineNode[],
  insertions: AgentInsertionPreview[],
  insertionsByParentId: Map<string, AgentInsertionPreview[]>,
): OutlineNode[] {
  const next = [...children]
  insertions.forEach((insertion, offset) => {
    // 多个插入预览按目标 index 排列，offset 抵消前一个预览节点插入造成的位置变化。
    const targetIndex = Math.max(0, Math.min(next.length, insertion.index + offset))
    next.splice(targetIndex, 0, createAgentInsertionPreviewOutlineNode(insertion, insertionsByParentId))
  })
  return next
}

export function attachAgentInsertionPreviewGraphData(
  graph: GraphData,
  insertionsByParentId: Map<string, AgentInsertionPreview[]>,
): GraphData {
  if (insertionsByParentId.size === 0) return graph

  const previewByNodeId = createAgentInsertionPreviewLookup(insertionsByParentId)

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const preview = previewByNodeId.get(node.id)
      if (!preview) return node

      return {
        ...node,
        data: {
          ...node.data,
          label: preview.insertion.node.text || '空白节点',
          agentInsertion: preview.insertion,
          agentInsertionDepth: preview.depth,
        },
      }
    }),
    edges: graph.edges.map((edge) => (
      isAgentInsertionNodeId(edge.target)
        ? {
          ...edge,
          style: { stroke: '#059669', strokeWidth: 1.8, strokeDasharray: '4 4' },
        }
        : edge
    )),
  }
}

function createAgentInsertionPreviewLookup(
  insertionsByParentId: Map<string, AgentInsertionPreview[]>,
): Map<string, { insertion: AgentInsertionPreview; depth: number }> {
  const previews = new Map<string, { insertion: AgentInsertionPreview; depth: number }>()
  const insertedNodeIds = collectAgentInsertionNodeIds(insertionsByParentId)

  const visit = (insertion: AgentInsertionPreview, depth: number) => {
    previews.set(createAgentInsertionNodeId(insertion.node.id), { insertion, depth })
    insertion.node.children?.forEach((child, index) => {
      visit({ index, node: child }, depth + 1)
    })
    insertionsByParentId.get(insertion.node.id)?.forEach((childInsertion) => {
      visit(childInsertion, depth + 1)
    })
  }

  insertionsByParentId.forEach((insertions, parentNodeId) => {
    if (insertedNodeIds.has(parentNodeId)) return
    insertions.forEach((insertion) => visit(insertion, 1))
  })

  return previews
}

function collectAgentInsertionNodeIds(
  insertionsByParentId: Map<string, AgentInsertionPreview[]>,
): Set<string> {
  const ids = new Set<string>()
  const visit = (insertion: AgentInsertionPreview) => {
    ids.add(insertion.node.id)
    insertion.node.children?.forEach((child, index) => visit({ index, node: child }))
  }

  insertionsByParentId.forEach((insertions) => {
    insertions.forEach(visit)
  })

  return ids
}

export function createAgentInsertionNodeId(nodeId: string): string {
  return `${AGENT_INSERTION_NODE_PREFIX}${nodeId}`
}

export function isAgentInsertionNodeId(nodeId: string): boolean {
  return nodeId.startsWith(AGENT_INSERTION_NODE_PREFIX)
}

export function getAgentInsertionFromGraphNode(node: Node): AgentInsertionPreview | null {
  const data = node.data as AgentInsertionGraphNodeData | undefined
  return data?.agentInsertion ?? null
}

export function getAgentInsertionDepthFromGraphNode(node: Node): number {
  const data = node.data as AgentInsertionGraphNodeData | undefined
  return data?.agentInsertionDepth ?? 0
}
