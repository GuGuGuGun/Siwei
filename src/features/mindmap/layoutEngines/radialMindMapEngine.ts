import { Position } from 'reactflow'

import type { MindMapLayoutPosition, MindMapLayoutState, OutlineNode } from '../../../types/document'
import type { MindMapLayoutEngine, MindMapLayoutInput } from '../layoutEngine'
import { normalizeMindMapLayoutState } from '../mindMapLayoutState'
import {
  attachDirectionalEdgeHandles,
  createResult,
  RADIAL_BASE_RADIUS,
  RADIAL_LEVEL_RADIUS_GAP,
  RADIAL_MIN_SECTOR_RADIANS,
  resolveNodeSize,
} from './shared'

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
