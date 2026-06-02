import { Edge as FlowEdge, Node as FlowNode } from 'reactflow'

import type {
  MindMapLayoutNodeState,
  MindMapLayoutPosition,
  MindMapLayoutState,
  MindMapLayoutStrategy,
  OutlineNode,
} from '../../../types/document'
import {
  MIND_MAP_LAYOUT_ENGINE_VERSION,
  normalizeMindMapLayoutState,
} from '../mindMapLayoutState'
import type {
  MindMapLayoutDiagnostics,
  MindMapLayoutInput,
  MindMapLayoutResult,
  MindMapNodeSize,
} from '../layoutEngine'

export const DEFAULT_NODE_SIZE: MindMapNodeSize = { width: 200, height: 44 }
export const MAX_ESTIMATED_NODE_WIDTH = 320
export const MIN_ESTIMATED_NODE_WIDTH = 160
export const LEVEL_GAP = 260
export const SIBLING_GAP = 34
export const RADIAL_BASE_RADIUS = 280
export const RADIAL_LEVEL_RADIUS_GAP = 240
export const RADIAL_MIN_SECTOR_RADIANS = Math.PI / 10
export const FREE_CANVAS_CHILD_GAP_X = 280
export const FREE_CANVAS_CHILD_GAP_Y = 96

const DIAGNOSTIC_BOUNDS = 20000

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

export function createResult(
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

export function withDiagnostics(
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

export function createDiagnostics(
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

export function attachDirectionalEdgeHandles(
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

export function findOutlineNode(root: OutlineNode, nodeId: string): OutlineNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children) {
    const found = findOutlineNode(child, nodeId)
    if (found) return found
  }
  return null
}

export function flattenOutlineNodes(root: OutlineNode): OutlineNode[] {
  return [root, ...root.children.flatMap(flattenOutlineNodes)]
}

export function deterministicAngle(nodeId: string, index: number, count: number): number {
  let hash = 0
  for (let charIndex = 0; charIndex < nodeId.length; charIndex += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(charIndex)) >>> 0
  }
  return ((index / count) * Math.PI * 2) + (hash % 360) * Math.PI / 1800
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function resolveNodeSize(nodeId: string, sizes: Record<string, MindMapNodeSize>): MindMapNodeSize {
  return sizes[nodeId] ?? DEFAULT_NODE_SIZE
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
