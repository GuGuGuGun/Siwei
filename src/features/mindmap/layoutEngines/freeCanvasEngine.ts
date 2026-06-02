import type {
  MindMapLayoutNodeState,
  MindMapLayoutPosition,
  MindMapLayoutState,
  MindMapLayoutStrategy,
  OutlineNode,
} from '../../../types/document'
import type { MindMapLayoutEngine, MindMapNodeSize } from '../layoutEngine'
import {
  MIND_MAP_LAYOUT_ENGINE_VERSION,
  normalizeMindMapLayoutState,
} from '../mindMapLayoutState'
import {
  attachDirectionalEdgeHandles,
  createResult,
  findOutlineNode,
  FREE_CANVAS_CHILD_GAP_X,
  FREE_CANVAS_CHILD_GAP_Y,
  resolveNodeSize,
} from './shared'

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
