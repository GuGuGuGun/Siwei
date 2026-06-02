import type { MindMapLayoutPosition, MindMapLayoutState, OutlineNode } from '../../../types/document'
import { MIND_MAP_LAYOUT_ENGINE_VERSION, normalizeMindMapLayoutState } from '../mindMapLayoutState'
import { outlineToGraph } from '../outlineToGraph'
import type {
  ForceDirectedLayoutParams,
  MindMapLayoutResult,
  MindMapNodeSize,
} from '../layoutEngine'
import {
  attachDirectionalEdgeHandles,
  createDiagnostics,
  deterministicAngle,
  flattenOutlineNodes,
  now,
} from './shared'

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
