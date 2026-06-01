import { Edge as FlowEdge, Node as FlowNode, Position } from 'reactflow'
import type {
  MindMapLayoutNodeState,
  MindMapLayoutPosition,
  MindMapLayoutState,
  MindMapLayoutStrategy,
  OutlineNode,
} from '../../types/document'
import { GraphData } from './outlineToGraph'
import { outlineToGraph } from './outlineToGraph'
import { layoutGraph } from './layoutGraph'
import {
  DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
  MIND_MAP_LAYOUT_ENGINE_VERSION,
  normalizeMindMapLayoutState,
  SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES,
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
  mode: 'persistent' | 'transient' | 'preview'
}

export interface MindMapLayoutDiagnostics {
  strategy: MindMapLayoutStrategy
  durationMs: number
  nodeCount: number
  positionedCount: number
  missingPositionCount: number
  lockedCount: number
  overlapCount: number
  outOfBoundsCount: number
  fallbackReason?: string
  workerEnabled?: boolean
  workerDurationMs?: number
  workerFallbackReason?: string
}

export interface MindMapLayoutResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
  layoutState?: MindMapLayoutState
  diagnostics?: MindMapLayoutDiagnostics
}

export interface MindMapLayoutEngine {
  layout(input: MindMapLayoutInput): MindMapLayoutResult
}

const DEFAULT_NODE_SIZE: MindMapNodeSize = { width: 200, height: 44 }
const MAX_ESTIMATED_NODE_WIDTH = 320
const MIN_ESTIMATED_NODE_WIDTH = 160
const LEVEL_GAP = 260
const SIBLING_GAP = 34
const RADIAL_BASE_RADIUS = 280
const RADIAL_LEVEL_RADIUS_GAP = 240
const RADIAL_MIN_SECTOR_RADIANS = Math.PI / 10
const FREE_CANVAS_CHILD_GAP_X = 280
const FREE_CANVAS_CHILD_GAP_Y = 96
const DIAGNOSTIC_BOUNDS = 20000

export interface ForceDirectedLayoutParams {
  strength: number
  spread: number
  quality: number
}

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
  const startedAt = now()
  const engine = resolveLayoutEngine(input.strategy)

  try {
    return withDiagnostics(input, engine.layout(input), startedAt)
  } catch (error) {
    // 实验布局失败时回退到经典布局，保证用户仍能看到脑图而不是整屏空白。
    if (input.strategy === DEFAULT_MIND_MAP_LAYOUT_STRATEGY) throw error
    const fallbackResult = classicDagreEngine.layout({ ...input, strategy: DEFAULT_MIND_MAP_LAYOUT_STRATEGY })
    return withDiagnostics(
      input,
      fallbackResult,
      startedAt,
      `布局策略已回退到 classic-dagre: ${String(error)}`,
    )
  }
}

export const classicDagreEngine: MindMapLayoutEngine = {
  layout(input) {
    const layouted = layoutGraph(input.graphData, {
      savedLayout: Object.fromEntries(
        Object.entries(normalizeMindMapLayoutState(input.persistedLayout)?.nodes ?? {})
          // 经典布局只保留用户锁定的手动节点，避免旧自动坐标阻止重新排版。
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

    // 单主题文档以主题居中、根节点退到一侧，更贴近“标题 + 中心主题”的脑图阅读习惯。
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

export const radialMindMapEngine: MindMapLayoutEngine = {
  layout(input) {
    const graphNodeIds = new Set(input.graphData.nodes.map((node) => node.id))
    const positions = new Map<string, MindMapLayoutPosition>()
    const persisted = normalizeMindMapLayoutState(input.persistedLayout)

    layoutRadialNode({
      node: input.root,
      depth: 0,
      centerAngle: 0,
      sectorStartAngle: 0,
      sectorEndAngle: Math.PI * 2,
      graphNodeIds,
      input,
      positions,
      persisted,
    })

    const nodes = input.graphData.nodes.map((node) => {
      const position = positions.get(node.id) ?? node.position
      const size = resolveNodeSize(node.id, input.nodeSizes)
      const centerX = position.x + size.width / 2
      const centerY = position.y + size.height / 2

      return {
        ...node,
        // 连线手柄按节点相对圆心方向切换，减少径向布局中边线穿过节点主体。
        targetPosition: centerX < 0 ? Position.Right : Position.Left,
        sourcePosition: centerX < 0 ? Position.Left : Position.Right,
        position,
        data: {
          ...node.data,
          radialAngle: Math.atan2(centerY, centerX),
        },
      }
    })

    return createResult(input, nodes, attachDirectionalEdgeHandles(input.graphData.edges, nodes, input.nodeSizes))
  },
}

export const freeCanvasEngine: MindMapLayoutEngine = {
  layout(input) {
    const graphNodeIds = new Set(input.graphData.nodes.map((node) => node.id))
    const persisted = normalizeMindMapLayoutState(input.persistedLayout, 'free-canvas')
    const positions = new Map<string, MindMapLayoutPosition>()
    const sourceByNodeId = new Map<string, MindMapLayoutNodeState['source']>()

    layoutFreeCanvasNode({
      node: input.root,
      parentId: null,
      index: 0,
      graphNodeIds,
      positions,
      sourceByNodeId,
      persisted,
      nodeSizes: input.nodeSizes,
    })

    const nodes = input.graphData.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    }))

    return createResult(
      input,
      nodes,
      attachDirectionalEdgeHandles(input.graphData.edges, nodes, input.nodeSizes),
      { sourceByNodeId },
    )
  },
}

export function relayoutMindMapBranch(params: {
  root: OutlineNode
  branchRootId: string
  layout: MindMapLayoutState
  nodeSizes: Record<string, MindMapNodeSize>
  strategy: MindMapLayoutStrategy
  includeBranchRoot?: boolean
}): MindMapLayoutState {
  const normalized = normalizeMindMapLayoutState(params.layout, params.strategy) ?? params.layout
  const branchRoot = findOutlineNode(params.root, params.branchRootId)
  if (!branchRoot) return normalized

  const nextNodes: MindMapLayoutState['nodes'] = { ...normalized.nodes }
  const branchRootState = nextNodes[params.branchRootId]
  const branchOrigin = branchRootState?.position ?? { x: 0, y: 0 }

  const visit = (node: OutlineNode, parentPosition: MindMapLayoutPosition, index: number, depth: number) => {
    const existing = nextNodes[node.id]
    const shouldKeepPosition = node.id === params.branchRootId && !params.includeBranchRoot || existing?.locked
    const position = shouldKeepPosition
      ? existing?.position ?? parentPosition
      : {
        x: parentPosition.x + FREE_CANVAS_CHILD_GAP_X,
        y: parentPosition.y + (index - (node.children.length - 1) / 2) * FREE_CANVAS_CHILD_GAP_Y + depth * 12,
      }

    nextNodes[node.id] = {
      position,
      source: shouldKeepPosition ? existing?.source ?? 'manual' : 'incremental',
      locked: existing?.locked ?? false,
      updatedAt: shouldKeepPosition ? existing?.updatedAt : Date.now(),
    }

    node.children.forEach((child, childIndex) => visit(child, position, childIndex, depth + 1))
  }

  branchRoot.children.forEach((child, index) => visit(child, branchOrigin, index, 1))

  if (params.includeBranchRoot && branchRootState && !branchRootState.locked) {
    nextNodes[params.branchRootId] = {
      ...branchRootState,
      source: 'incremental',
      position: branchOrigin,
    }
  }

  return {
    engineVersion: MIND_MAP_LAYOUT_ENGINE_VERSION,
    strategy: params.strategy,
    nodes: nextNodes,
  }
}

export function applyForceDirectedLayoutPreview(params: {
  root: OutlineNode
  layout: MindMapLayoutState
  nodeSizes: Record<string, MindMapNodeSize>
  params: ForceDirectedLayoutParams
  mode: 'preview' | 'apply'
}): MindMapLayoutResult {
  const graphData = outlineToGraph(params.root, new Set())
  const normalized = normalizeMindMapLayoutState(params.layout, 'force-directed') ?? params.layout
  const orderedNodes = flattenOutlineNodes(params.root)
  const nodeCount = Math.max(1, orderedNodes.length)
  const radius = 160 + params.params.spread * 80
  const iterations = Math.max(1, Math.round(params.params.quality))
  const positionById = new Map<string, MindMapLayoutPosition>()

  orderedNodes.forEach((node, index) => {
    const existing = normalized.nodes[node.id]
    if (existing?.locked) {
      positionById.set(node.id, existing.position)
      return
    }

    const angle = deterministicAngle(node.id, index, nodeCount)
    const base = existing?.position ?? { x: 0, y: 0 }
    const pull = params.params.strength / Math.max(1, iterations)
    positionById.set(node.id, {
      x: Math.round((Math.cos(angle) * radius + base.x * pull) * 100) / 100,
      y: Math.round((Math.sin(angle) * radius + base.y * pull) * 100) / 100,
    })
  })

  const nodes = graphData.nodes.map((node) => ({
    ...node,
    position: positionById.get(node.id) ?? node.position,
  }))
  const edges = attachDirectionalEdgeHandles(graphData.edges, nodes, params.nodeSizes)
  const result: MindMapLayoutResult = {
    nodes,
    edges,
    diagnostics: createDiagnostics('force-directed', nodes, normalized, params.nodeSizes, now(), undefined),
  }

  if (params.mode === 'apply') {
    result.layoutState = {
      engineVersion: MIND_MAP_LAYOUT_ENGINE_VERSION,
      strategy: 'force-directed',
      nodes: Object.fromEntries(orderedNodes.map((node) => {
        const previous = normalized.nodes[node.id]
        const locked = previous?.locked ?? false
        return [node.id, {
          position: positionById.get(node.id) ?? previous?.position ?? { x: 0, y: 0 },
          source: locked ? previous?.source ?? 'manual' : 'force-applied',
          locked,
          updatedAt: locked ? previous?.updatedAt : Date.now(),
        }]
      })),
    }
  }

  return result
}

function resolveLayoutEngine(strategy: MindMapLayoutStrategy): MindMapLayoutEngine {
  if (strategy === 'balanced-mindmap') return balancedMindMapEngine
  if (strategy === 'radial-mindmap') return radialMindMapEngine
  if (strategy === 'free-canvas') return freeCanvasEngine
  if (!SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES.includes(strategy as typeof SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES[number])) {
    return classicDagreEngine
  }
  return classicDagreEngine
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

function createResult(
  input: MindMapLayoutInput,
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: { sourceByNodeId?: Map<string, MindMapLayoutNodeState['source']> } = {},
): MindMapLayoutResult {
  if (input.mode === 'transient' || input.mode === 'preview') {
    return { nodes, edges }
  }

  // 只有持久模式写回布局状态；搜索、聚焦和 Agent 预览等临时视图不污染用户保存的坐标。
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
          source: previous?.locked ? previous.source : previous?.source ?? options.sourceByNodeId?.get(node.id) ?? 'auto',
          locked: previous?.locked ?? false,
          updatedAt: previous?.updatedAt,
        }]
      })),
    },
  }
}

function withDiagnostics(
  input: MindMapLayoutInput,
  result: MindMapLayoutResult,
  startedAt: number,
  fallbackReason?: string,
): MindMapLayoutResult {
  return {
    ...result,
    diagnostics: result.diagnostics ?? createDiagnostics(
      input.strategy,
      result.nodes,
      input.persistedLayout,
      input.nodeSizes,
      startedAt,
      fallbackReason,
    ),
  }
}

function createDiagnostics(
  strategy: MindMapLayoutStrategy,
  nodes: FlowNode[],
  persistedLayout: MindMapLayoutState | undefined,
  nodeSizes: Record<string, MindMapNodeSize>,
  startedAt: number,
  fallbackReason?: string,
): MindMapLayoutDiagnostics {
  const lockedCount = Object.values(normalizeMindMapLayoutState(persistedLayout)?.nodes ?? {})
    .filter((state) => state.locked)
    .length
  const positionedNodes = nodes.filter((node) => Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y))

  return {
    strategy,
    durationMs: Math.max(0, Math.round((now() - startedAt) * 100) / 100),
    nodeCount: nodes.length,
    positionedCount: positionedNodes.length,
    missingPositionCount: nodes.length - positionedNodes.length,
    lockedCount,
    overlapCount: countOverlaps(positionedNodes, nodeSizes),
    outOfBoundsCount: positionedNodes.filter((node) => (
      Math.abs(node.position.x) > DIAGNOSTIC_BOUNDS || Math.abs(node.position.y) > DIAGNOSTIC_BOUNDS
    )).length,
    fallbackReason,
  }
}

function countOverlaps(nodes: FlowNode[], nodeSizes: Record<string, MindMapNodeSize>): number {
  let count = 0
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      if (rectanglesOverlap(nodes[leftIndex], nodes[rightIndex], nodeSizes)) count += 1
    }
  }
  return count
}

function rectanglesOverlap(left: FlowNode, right: FlowNode, nodeSizes: Record<string, MindMapNodeSize>): boolean {
  const leftSize = resolveNodeSize(left.id, nodeSizes)
  const rightSize = resolveNodeSize(right.id, nodeSizes)
  return left.position.x < right.position.x + rightSize.width
    && left.position.x + leftSize.width > right.position.x
    && left.position.y < right.position.y + rightSize.height
    && left.position.y + leftSize.height > right.position.y
}

function layoutFreeCanvasNode(params: {
  node: OutlineNode
  parentId: string | null
  index: number
  graphNodeIds: Set<string>
  positions: Map<string, MindMapLayoutPosition>
  sourceByNodeId: Map<string, MindMapLayoutNodeState['source']>
  persisted?: MindMapLayoutState
  nodeSizes: Record<string, MindMapNodeSize>
}) {
  if (!params.graphNodeIds.has(params.node.id)) return

  const persistedNode = params.persisted?.nodes[params.node.id]
  const parentPosition = params.parentId ? params.positions.get(params.parentId) : undefined
  const siblingCount = params.parentId
    ? params.persisted ? params.node.children.length : 1
    : 1
  const position = persistedNode?.position
    ?? (parentPosition
      ? {
        x: parentPosition.x + FREE_CANVAS_CHILD_GAP_X,
        y: parentPosition.y + (params.index - (siblingCount - 1) / 2) * FREE_CANVAS_CHILD_GAP_Y,
      }
      : { x: -resolveNodeSize(params.node.id, params.nodeSizes).width / 2, y: -resolveNodeSize(params.node.id, params.nodeSizes).height / 2 })

  params.positions.set(params.node.id, position)
  if (!persistedNode) {
    params.sourceByNodeId.set(params.node.id, params.parentId ? 'incremental' : 'auto')
  }

  params.node.children
    .filter((child) => params.graphNodeIds.has(child.id))
    .forEach((child, index, siblings) => {
      layoutFreeCanvasNode({
        ...params,
        node: child,
        parentId: params.node.id,
        index: index - (siblings.length - params.node.children.length),
      })
    })
}

function findOutlineNode(root: OutlineNode, nodeId: string): OutlineNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children) {
    const found = findOutlineNode(child, nodeId)
    if (found) return found
  }
  return null
}

function flattenOutlineNodes(root: OutlineNode): OutlineNode[] {
  return [root, ...root.children.flatMap(flattenOutlineNodes)]
}

function deterministicAngle(nodeId: string, index: number, count: number): number {
  let hash = 0
  for (let charIndex = 0; charIndex < nodeId.length; charIndex += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(charIndex)) >>> 0
  }
  return ((index / count) * Math.PI * 2) + (hash % 360) * Math.PI / 1800
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
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
    // 按子树规模动态分配左右分支，避免节点数量相同但内容深度差异导致一侧过重。
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

  // 先估算每棵子树占用高度，再用游标逐段居中摆放，降低兄弟分支重叠概率。
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

function layoutRadialNode(params: {
  node: OutlineNode
  depth: number
  centerAngle: number
  sectorStartAngle: number
  sectorEndAngle: number
  graphNodeIds: Set<string>
  input: MindMapLayoutInput
  positions: Map<string, MindMapLayoutPosition>
  persisted?: MindMapLayoutState
}) {
  const { node, depth, centerAngle, sectorStartAngle, sectorEndAngle, graphNodeIds, input, positions, persisted } = params
  if (!graphNodeIds.has(node.id)) return

  const size = resolveNodeSize(node.id, input.nodeSizes)
  const angle = depth === 0 ? 0 : normalizeAngle(centerAngle)
  const radius = depth === 0 ? 0 : RADIAL_BASE_RADIUS + Math.max(0, depth - 1) * RADIAL_LEVEL_RADIUS_GAP
  const center = {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
  const autoPosition = {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  }
  const persistedNode = persisted?.nodes[node.id]
  positions.set(node.id, persistedNode?.locked ? persistedNode.position : autoPosition)

  const children = node.children.filter((child) => graphNodeIds.has(child.id))
  if (children.length === 0) return

  // 每个节点把自己的角度扇区平均分给可见子节点，深层分支至少保留一个最小扇区避免挤成一条线。
  const sectorSize = depth === 0
    ? Math.PI * 2
    : Math.max(RADIAL_MIN_SECTOR_RADIANS, sectorEndAngle - sectorStartAngle)
  const childSectorSize = sectorSize / children.length

  children.forEach((child, index) => {
    const childCenter = children.length === 1
      ? angle
      : depth === 0
        ? index * childSectorSize
        : sectorStartAngle + childSectorSize * (index + 0.5)
    const childStart = childCenter - childSectorSize / 2
    const childEnd = childStart + childSectorSize
    layoutRadialNode({
      node: child,
      depth: depth + 1,
      centerAngle: childCenter,
      sectorStartAngle: childStart,
      sectorEndAngle: childEnd,
      graphNodeIds,
      input,
      positions,
      persisted,
    })
  })
}

function normalizeAngle(angle: number): number {
  if (angle > Math.PI) return angle - Math.PI * 2
  return angle
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
