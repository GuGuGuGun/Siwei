export interface OutlineDocument {
  id: string
  title: string
  version: number
  createdAt: number
  updatedAt: number
  mindMapLayout?: Record<string, MindMapLayoutPosition>
  root: OutlineNode
}

export interface MindMapLayoutPosition {
  x: number
  y: number
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
