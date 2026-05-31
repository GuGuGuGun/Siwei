export interface OutlineDocument {
  id: string
  title: string
  version: number
  createdAt: number
  updatedAt: number
  mindMapLayout?: MindMapLayoutState
  root: OutlineNode
}

export interface MindMapLayoutPosition {
  x: number
  y: number
}

export type MindMapLayoutStrategy = 'classic-dagre' | 'balanced-mindmap' | 'radial-mindmap' | (string & {})
export type MindMapLayoutNodeSource = 'auto' | 'manual'

export interface MindMapLayoutState {
  engineVersion: number
  strategy: MindMapLayoutStrategy
  nodes: Record<string, MindMapLayoutNodeState>
}

export interface MindMapLayoutNodeState {
  position: MindMapLayoutPosition
  source: MindMapLayoutNodeSource
  locked: boolean
  updatedAt?: number
}

export interface OutlineNode {
  id: string
  text: string
  note?: string
  collapsed?: boolean
  checked?: boolean
  tags?: string[]
  createdAt: number
  updatedAt: number
  children: OutlineNode[]
}

export interface RecentDocItem {
  path: string
  title: string
  lastOpenedAt: number
}

export type SearchMatchSource = 'text' | 'note' | 'tag'

export interface SearchMatch {
  source: SearchMatchSource
  value: string
  matchIndices: Array<[number, number]>
}

export interface SearchResult {
  nodeId: string
  text: string
  path: string[]
  matchIndices: Array<[number, number]>
  matchSources: SearchMatchSource[]
  matches: SearchMatch[]
}
