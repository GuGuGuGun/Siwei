import { OutlineNode } from '../../types/document'
import { Node as FlowNode, Edge as FlowEdge } from 'reactflow'

export interface GraphData {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/**
 * Traverses the OutlineNode tree and converts it into nodes and edges for React Flow.
 * Skips children of collapsed nodes.
 */
export function outlineToGraph(
  root: OutlineNode,
  collapsedNodeIds: Set<string>
): GraphData {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  const traverse = (node: OutlineNode, parentId: string | null) => {
    // Add current node to nodes list
    nodes.push({
      id: node.id,
      position: { x: 0, y: 0 },
      data: { label: node.text || ' ' },
      type: parentId === null ? 'input' : 'custom',
    })

    // If there is a parent, draw a dashed stitching thread edge
    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep',
        style: { stroke: '#A27B5C', strokeWidth: 1.8, strokeDasharray: '4 4' },
      })
    }

    // Stop traversing if this node is collapsed
    const isCollapsed = node.collapsed || collapsedNodeIds.has(node.id)
    if (isCollapsed) return

    if (node.children) {
      node.children.forEach((child) => {
        traverse(child, node.id)
      })
    }
  }

  traverse(root, null)

  return { nodes, edges }
}
