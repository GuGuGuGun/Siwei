import type { Node } from 'reactflow'
import type { OutlineNode } from '../../types/document'
import { estimateMindMapNodeSize, type MindMapNodeSize } from './layoutEngine'

export function attachLayoutNodeSizes(
  nodes: Node[],
  nodeSizes: Record<string, MindMapNodeSize>,
): Node[] {
  return nodes.map((node) => {
    const size = nodeSizes[node.id]
    if (!size) return node

    return {
      ...node,
      width: size.width,
      height: size.height,
    }
  })
}

export function buildMindMapNodeSizes(
  root: OutlineNode,
  measuredNodeSizes: Record<string, MindMapNodeSize>,
): Record<string, MindMapNodeSize> {
  const sizes: Record<string, MindMapNodeSize> = {}
  const visit = (node: OutlineNode) => {
    sizes[node.id] = measuredNodeSizes[node.id] ?? estimateMindMapNodeSize(node)
    node.children.forEach(visit)
  }

  visit(root)
  return sizes
}
