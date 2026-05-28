import dagre from 'dagre'
import { Node as FlowNode, Edge as FlowEdge, Position } from 'reactflow'
import { GraphData } from './outlineToGraph'
import { MindMapLayoutPosition } from '../../types/document'

interface LayoutGraphOptions {
  savedLayout?: Record<string, MindMapLayoutPosition>
  preserveSavedPositions?: boolean
}

/**
 * Positions the React Flow elements in a Left-to-Right (LR) hierarchy using the Dagre layout engine.
 */
export function layoutGraph(graphData: GraphData, options: LayoutGraphOptions = {}): GraphData {
  const { nodes, edges } = graphData
  if (nodes.length === 0) return graphData

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  const nodeWidth = 200
  const nodeHeight = 44

  // Set up graph layout options
  // rankdir: 'LR' (Left-to-Right) is standard for mind maps
  // nodesep: separation between nodes in the same rank
  // ranksep: separation between ranks (columns)
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 30,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  })

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Compute layout
  dagre.layout(dagreGraph)

  // Map computed coordinates back to nodes
  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id)
    const savedPosition = options.savedLayout?.[node.id]
    
    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: options.preserveSavedPositions && savedPosition
        ? savedPosition
        : {
          x: dagreNode.x - nodeWidth / 2,
          y: dagreNode.y - nodeHeight / 2,
        },
    }
  })

  return {
    nodes: layoutedNodes,
    edges,
  }
}
