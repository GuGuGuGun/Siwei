import { Position } from 'reactflow'

import type { MindMapLayoutPosition, MindMapLayoutState, OutlineNode } from '../../../types/document'
import type { MindMapLayoutEngine, MindMapLayoutInput } from '../layoutEngine'
import { normalizeMindMapLayoutState } from '../mindMapLayoutState'
import {
  attachDirectionalEdgeHandles,
  createResult,
  LEVEL_GAP,
  resolveNodeSize,
  SIBLING_GAP,
} from './shared'

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
