import type {
  MindMapLayoutNodeState,
  MindMapLayoutPosition,
  MindMapLayoutState,
  MindMapLayoutStrategy,
} from '../../types/document'

export const MIND_MAP_LAYOUT_ENGINE_VERSION = 2
export const DEFAULT_MIND_MAP_LAYOUT_STRATEGY: MindMapLayoutStrategy = 'classic-dagre'
export const SUPPORTED_MIND_MAP_LAYOUT_STRATEGIES = [
  'classic-dagre',
  'balanced-mindmap',
  'radial-mindmap',
] as const

export type LegacyMindMapLayoutState = Record<string, MindMapLayoutPosition>

export function isMindMapLayoutState(value: unknown): value is MindMapLayoutState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MindMapLayoutState>
  return typeof candidate.engineVersion === 'number'
    && typeof candidate.strategy === 'string'
    && Boolean(candidate.nodes)
    && typeof candidate.nodes === 'object'
}

export function normalizeMindMapLayoutState(
  layout: MindMapLayoutState | LegacyMindMapLayoutState | undefined,
  strategy: MindMapLayoutStrategy = DEFAULT_MIND_MAP_LAYOUT_STRATEGY,
): MindMapLayoutState | undefined {
  if (!layout) return undefined
  if (isMindMapLayoutState(layout)) return layout

  const nodes = Object.entries(layout).reduce<Record<string, MindMapLayoutNodeState>>((next, [nodeId, position]) => {
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return next
    next[nodeId] = {
      position,
      source: 'manual',
      locked: true,
    }
    return next
  }, {})

  return {
    engineVersion: MIND_MAP_LAYOUT_ENGINE_VERSION,
    strategy,
    nodes,
  }
}

export function getPersistedNodePositions(
  layout: MindMapLayoutState | LegacyMindMapLayoutState | undefined,
): Record<string, MindMapLayoutPosition> | undefined {
  const normalized = normalizeMindMapLayoutState(layout)
  if (!normalized) return undefined

  return Object.fromEntries(
    Object.entries(normalized.nodes).map(([nodeId, nodeState]) => [nodeId, nodeState.position]),
  )
}

export function createMindMapLayoutState(
  positions: Record<string, MindMapLayoutPosition>,
  options: {
    strategy: MindMapLayoutStrategy
    lockedNodeIds?: Set<string>
    source?: MindMapLayoutNodeState['source']
    previous?: MindMapLayoutState | LegacyMindMapLayoutState
    updatedAt?: number
  },
): MindMapLayoutState {
  const previous = normalizeMindMapLayoutState(options.previous, options.strategy)
  const lockedNodeIds = options.lockedNodeIds ?? new Set<string>()
  const source = options.source ?? 'auto'
  const updatedAt = options.updatedAt ?? Date.now()

  return {
    engineVersion: MIND_MAP_LAYOUT_ENGINE_VERSION,
    strategy: options.strategy,
    nodes: Object.entries(positions).reduce<Record<string, MindMapLayoutNodeState>>((next, [nodeId, position]) => {
      const previousNode = previous?.nodes[nodeId]
      const isLocked = lockedNodeIds.has(nodeId) || previousNode?.locked === true
      next[nodeId] = {
        position,
        source: lockedNodeIds.has(nodeId) ? 'manual' : previousNode?.source ?? source,
        locked: isLocked,
        updatedAt: lockedNodeIds.has(nodeId) ? updatedAt : previousNode?.updatedAt,
      }
      return next
    }, {})
  }
}
