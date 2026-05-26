export interface OutlineDocument {
  id: string
  title: string
  version: number
  createdAt: number
  updatedAt: number
  root: OutlineNode
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

export interface SearchResult {
  nodeId: string
  text: string
  path: string[]
  matchIndices: Array<[number, number]>
}
