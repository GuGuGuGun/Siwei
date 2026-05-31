import { Edge as FlowEdge, Node as FlowNode, Position } from 'reactflow'
import type {
  MindMapLayoutPosition,
  MindMapLayoutState,
  MindMapLayoutStrategy,
  OutlineNode,
} from '../../types/document'
import { GraphData } from './outlineToGraph'
import { layoutGraph } from './layoutGraph'
import {
  DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
  MIND_MAP_LAYOUT_ENGINE_VERSION,
  normalizeMindMapLayoutState,
} from './mindMapLayoutState'

export interface MindMapNodeSize {
  width: number
  height: number
}

export interface MindMapLayoutInput {
  root: OutlineNode
  graphData: GraphData
  collapsedNodeIds: Set<string>
  visibleNodeIds?: Set<string>
  strategy: MindMapLayoutStrategy
  persistedLayout?: MindMapLayoutState
  nodeSizes: Record<string, MindMapNodeSize>
  mode: 'persistent' | 'transient'
}

export interface MindMapLayoutResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
  layoutState?: MindMapLayoutState
  diagnostics?: string[]
}

export interface MindMapLayoutEngine {
  layout(input: MindMapLayoutInput): MindMapLayoutResult
}

const DEFAULT_NODE_SIZE: MindMapNodeSize = { width: 200, height: 44 }
const MAX_ESTIMATED_NODE_WIDTH = 320
const MIN_ESTIMATED_NODE_WIDTH = 160
const LEVEL_GAP = 260
const SIBLING_GAP = 34

export function estimateMindMapNodeSize(node: OutlineNode): MindMapNodeSize {
  const textWidth = Math.min(MAX_ESTIMATED_NODE_WIDTH, Math.max(MIN_ESTIMATED_NODE_WIDTH, 96 + node.text.length * 8))
  const metadataRows = [
    node.note?.trim(),
    node.tags?.length ? 'tags' : '',
    node.checked !== undefined ? 'task' : '',
  ].filter(Boolean).length

  return {
    width: textWidth,
    height: DEFAULT_NODE_SIZE.height + metadataRows * 18,
  }
}

export function layoutMindMap(input: MindMapLayoutInput): MindMapLayoutResult {
  const engine = input.strategy === 'balanced-mindmap' ? balancedMindMapEngine : classicDagreEngine

  try {
    return engine.layout(input)
  } catch (error) {
    if (input.strategy === DEFAULT_MIND_MAP_LAYOUT_STRATEGY) throw error
    return {
      ...classicDagreEngine.layout({ ...input, strategy: DEFAULT_MIND_MAP_LAYOUT_STRATEGY }),
      diagnostics: [`布局策略已回退到 classic-dagre: ${String(error)}`],
    }
  }
}

export const classicDagreEngine: MindMapLayoutEngine = {
  layout(input) {
    const layouted = layoutGraph(input.graphData, {
      savedLayout: Object.fromEntries(
        Object.entries(normalizeMindMapLayoutState(input.persistedLayout)?.nodes ?? {})
          .filter(([, state]) => state.locked)
          .map(([nodeId, state]) => [nodeId, state.position]),
      ),
      preserveSavedPositions: true,
      nodeSizes: input.nodeSizes,
    })

    return createResult(input, layouted.nodes, attachDirectionalEdgeHandles(layouted.edges, layouted.nodes, input.nodeSizes))
  },
}

export const balancedMindMapEngine: MindMapLayoutEngine = {
  layout(input) {
    const graphNodeIds = new Set(input.graphData.nodes.map((node) => node.id))
    const positions = new Map<string, MindMapLayoutPosition>()
    const persisted = normalizeMindMapLayoutState(input.persistedLayout)
    const visibleChildren = input.root.children.filter((child) => graphNodeIds.has(child.id))

    if (visibleChildren.length === 1) {
      layoutSingleTopicMindMap({
        input,
        graphNodeIds,
        positions,
        persisted,
        topic: visibleChildren[0],
      })
    } else {
      layoutBalancedRootMindMap({
        input,
        graphNodeIds,
        positions,
        persisted,
        visibleChildren,
      })
    }

    const nodes = input.graphData.nodes.map((node) => ({
      ...node,
      targetPosition: (positions.get(node.id)?.x ?? 0) < 0 ? Position.Right : Position.Left,
      sourcePosition: (positions.get(node.id)?.x ?? 0) < 0 ? Position.Left : Position.Right,
      position: positions.get(node.id) ?? node.position,
    }))

    return createResult(input, nodes, attachDirectionalEdgeHandles(input.graphData.edges, nodes, input.nodeSizes))
  },
}

function layoutBalancedRootMindMap(params: {
  input: MindMapLayoutInput
  graphNodeIds: Set<string>
  positions: Map<string, MindMapLayoutPosition>
  persisted?: MindMapLayoutState
  visibleChildren: OutlineNode[]
}) {
  const { input, graphNodeIds, positions, persisted, visibleChildren } = params
  const rootSize = resolveNodeSize(input.root.id, input.nodeSizes)

  positions.set(input.root.id, persisted?.nodes[input.root.id]?.locked
    ? persisted.nodes[input.root.id].position
    : { x: -rootSize.width / 2, y: -rootSize.height / 2 })

  const branches = splitBalancedBranches(visibleChildren)
  layoutBranchGroup({
    children: branches.left,
    side: 'left',
    rootX: -LEVEL_GAP,
    input,
    graphNodeIds,
    positions,
    persisted,
  })
  layoutBranchGroup({
    children: branches.right,
    side: 'right',
    rootX: LEVEL_GAP,
    input,
    graphNodeIds,
    positions,
    persisted,
  })
}

function layoutSingleTopicMindMap(params: {
  input: MindMapLayoutInput
  graphNodeIds: Set<string>
  positions: Map<string, MindMapLayoutPosition>
  persisted?: MindMapLayoutState
  topic: OutlineNode
}) {
  const { input, graphNodeIds, positions, persisted, topic } = params
  const rootSize = resolveNodeSize(input.root.id, input.nodeSizes)
  const topicSize = resolveNodeSize(topic.id, input.nodeSizes)

  positions.set(topic.id, persisted?.nodes[topic.id]?.locked
    ? persisted.nodes[topic.id].position
    : { x: -topicSize.width / 2, y: -topicSize.height / 2 })
  positions.set(input.root.id, persisted?.nodes[input.root.id]?.locked
    ? persisted.nodes[input.root.id].position
    : { x: LEVEL_GAP - rootSize.width / 2, y: -rootSize.height / 2 })

  const children = topic.children.filter((child) => graphNodeIds.has(child.id))
  const branches = splitBalancedBranches(children)
  layoutBranchGroup({
    children: branches.left,
    side: 'left',
    rootX: -LEVEL_GAP,
    input,
    graphNodeIds,
    positions,
    persisted,
  })
  layoutBranchGroup({
    children: branches.right,
    side: 'right',
    rootX: LEVEL_GAP * 2,
    input,
    graphNodeIds,
    positions,
    persisted,
  })
}

function createResult(input: MindMapLayoutInput, nodes: FlowNode[], edges: FlowEdge[]): MindMapLayoutResult {
  if (input.mode === 'transient') {
    return { nodes, edges }
  }

  return {
    nodes,
    edges,
    layoutState: {
      engineVersion: MIND_MAP_LAYOUT_ENGINE_VERSION,
      strategy: input.strategy,
      nodes: Object.fromEntries(nodes.map((node) => {
        const previous = input.persistedLayout?.nodes[node.id]
        return [node.id, {
          position: node.position,
          source: previous?.locked ? previous.source : 'auto',
          locked: previous?.locked ?? false,
          updatedAt: previous?.updatedAt,
        }]
      })),
    },
  }
}

function attachDirectionalEdgeHandles(
  edges: FlowEdge[],
  nodes: FlowNode[],
  nodeSizes: Record<string, MindMapNodeSize>,
): FlowEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  return edges.map((edge) => {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return edge

    const sourceWidth = resolveNodeSize(source.id, nodeSizes).width
    const targetWidth = resolveNodeSize(target.id, nodeSizes).width
    const sourceCenterX = source.position.x + sourceWidth / 2
    const targetCenterX = target.position.x + targetWidth / 2
    const targetIsLeft = targetCenterX < sourceCenterX

    return {
      ...edge,
      sourceHandle: targetIsLeft ? 'left-source' : 'right-source',
      targetHandle: targetIsLeft ? 'right-target' : 'left-target',
    }
  })
}

function splitBalancedBranches(children: OutlineNode[]): { left: OutlineNode[]; right: OutlineNode[] } {
  const left: OutlineNode[] = []
  const right: OutlineNode[] = []
  let leftWeight = 0
  let rightWeight = 0

  children.forEach((child, index) => {
    const weight = getSubtreeWeight(child)
    const preferLeft = index % 2 === 0
    if (leftWeight <= rightWeight && preferLeft || rightWeight > leftWeight) {
      left.push(child)
      leftWeight += weight
    } else {
      right.push(child)
      rightWeight += weight
    }
  })

  return { left, right }
}

function getSubtreeWeight(node: OutlineNode): number {
  return 1 + node.children.reduce((sum, child) => sum + getSubtreeWeight(child), 0)
}

function layoutBranchGroup(params: {
  children: OutlineNode[]
  side: 'left' | 'right'
  rootX: number
  input: MindMapLayoutInput
  graphNodeIds: Set<string>
  positions: Map<string, MindMapLayoutPosition>
  persisted?: MindMapLayoutState
}) {
  const totalHeight = params.children.reduce((sum, child) => sum + estimateSubtreeHeight(child, params.input, params.graphNodeIds), 0)
  let cursorY = -totalHeight / 2

  params.children.forEach((child) => {
    const subtreeHeight = estimateSubtreeHeight(child, params.input, params.graphNodeIds)
    layoutSubtree({
      node: child,
      depth: 1,
      side: params.side,
      rootX: params.rootX,
      centerY: cursorY + subtreeHeight / 2,
      input: params.input,
      graphNodeIds: params.graphNodeIds,
      positions: params.positions,
      persisted: params.persisted,
    })
    cursorY += subtreeHeight
  })
}

function layoutSubtree(params: {
  node: OutlineNode
  depth: number
  side: 'left' | 'right'
  rootX: number
  centerY: number
  input: MindMapLayoutInput
  graphNodeIds: Set<string>
  positions: Map<string, MindMapLayoutPosition>
  persisted?: MindMapLayoutState
}) {
  if (!params.graphNodeIds.has(params.node.id)) return

  const size = resolveNodeSize(params.node.id, params.input.nodeSizes)
  const direction = params.side === 'left' ? -1 : 1
  const x = params.rootX + direction * LEVEL_GAP * (params.depth - 1) - size.width / 2
  const y = params.centerY - size.height / 2
  const persistedNode = params.persisted?.nodes[params.node.id]
  params.positions.set(params.node.id, persistedNode?.locked ? persistedNode.position : { x, y })

  const children = params.node.children.filter((child) => params.graphNodeIds.has(child.id))
  const totalHeight = children.reduce((sum, child) => sum + estimateSubtreeHeight(child, params.input, params.graphNodeIds), 0)
  let cursorY = params.centerY - totalHeight / 2

  children.forEach((child) => {
    const subtreeHeight = estimateSubtreeHeight(child, params.input, params.graphNodeIds)
    layoutSubtree({
      ...params,
      node: child,
      depth: params.depth + 1,
      centerY: cursorY + subtreeHeight / 2,
    })
    cursorY += subtreeHeight
  })
}

function estimateSubtreeHeight(
  node: OutlineNode,
  input: MindMapLayoutInput,
  graphNodeIds: Set<string>,
): number {
  if (!graphNodeIds.has(node.id)) return 0
  const size = resolveNodeSize(node.id, input.nodeSizes)
  const childHeight = node.children.reduce((sum, child) => sum + estimateSubtreeHeight(child, input, graphNodeIds), 0)
  return Math.max(size.height + SIBLING_GAP, childHeight)
}

function resolveNodeSize(nodeId: string, sizes: Record<string, MindMapNodeSize>): MindMapNodeSize {
  return sizes[nodeId] ?? DEFAULT_NODE_SIZE
}
