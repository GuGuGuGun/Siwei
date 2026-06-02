import type { Edge } from 'reactflow'
import type { GraphData } from './outlineToGraph'

export type MindMapBranchSide = 'left' | 'right'

export function createBranchSideKey(nodeId: string, side: MindMapBranchSide): string {
  return `${nodeId}:${side}`
}

export function filterCollapsedBranchSides(
  graph: GraphData,
  edges: Edge[],
  collapsedBranchSides: Set<string>,
): GraphData {
  if (collapsedBranchSides.size === 0) return graph

  const hiddenNodeIds = new Set<string>()
  const childrenBySource = edges.reduce<Map<string, Edge[]>>((next, edge) => {
    const current = next.get(edge.source) ?? []
    current.push(edge)
    next.set(edge.source, current)
    return next
  }, new Map())

  const hideSubtree = (nodeId: string) => {
    if (hiddenNodeIds.has(nodeId)) return
    hiddenNodeIds.add(nodeId)
    childrenBySource.get(nodeId)?.forEach((edge) => hideSubtree(edge.target))
  }

  // 左/右侧折叠以布局后的 sourceHandle 为准，因此这里从边方向反推出要隐藏的分支子树。
  edges.forEach((edge) => {
    const side = edge.sourceHandle === 'left-source' ? 'left' : edge.sourceHandle === 'right-source' ? 'right' : null
    if (!side || !collapsedBranchSides.has(createBranchSideKey(edge.source, side))) return
    hideSubtree(edge.target)
  })

  if (hiddenNodeIds.size === 0) return graph

  return {
    nodes: graph.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
    edges: graph.edges.filter((edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target)),
  }
}
