import { Edge as FlowEdge, Node as FlowNode } from 'reactflow'

import type {
  MindMapLayoutState,
  MindMapLayoutStrategy,
  OutlineNode,
} from '../../types/document'
import { GraphData } from './outlineToGraph'
import {
  DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
  SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES,
} from './mindMapLayoutState'
import { balancedMindMapEngine } from './layoutEngines/balancedMindMapEngine'
import { classicDagreEngine } from './layoutEngines/classicDagreEngine'
import { freeCanvasEngine, relayoutMindMapBranch } from './layoutEngines/freeCanvasEngine'
import { radialMindMapEngine } from './layoutEngines/radialMindMapEngine'
import { applyForceDirectedLayoutPreview } from './layoutEngines/forceDirectedEngine'
import {
  estimateMindMapNodeSize,
  now,
  withDiagnostics,
} from './layoutEngines/shared'

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

export interface ForceDirectedLayoutParams {
  strength: number
  spread: number
  quality: number
}

export {
  applyForceDirectedLayoutPreview,
  estimateMindMapNodeSize,
  relayoutMindMapBranch,
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

function resolveLayoutEngine(strategy: MindMapLayoutStrategy): MindMapLayoutEngine {
  if (strategy === 'balanced-mindmap') return balancedMindMapEngine
  if (strategy === 'radial-mindmap') return radialMindMapEngine
  if (strategy === 'free-canvas') return freeCanvasEngine
  if (!SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES.includes(strategy as typeof SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES[number])) {
    return classicDagreEngine
  }
  return classicDagreEngine
}
