export type LibraryDocumentStatus = 'ready' | 'missing' | 'invalid' | 'stale'

export interface LibraryDocumentItem {
  documentId: string
  title: string
  path: string
  updatedAt: number
  indexedAt: number
  fileMtime?: number
  nodeCount: number
  taskCount: number
  uncheckedTaskCount: number
  tags: string[]
  status: LibraryDocumentStatus
  errorSummary?: string
}

export interface LibraryNodeIndexItem {
  documentId: string
  nodeId: string
  text: string
  note?: string
  tags: string[]
  checked?: boolean
  path: string[]
}

export type LibrarySearchMatchSource = 'title' | 'text' | 'note' | 'tag'

export interface LibrarySearchResult {
  documentId: string
  documentTitle: string
  documentPath: string
  nodeId?: string
  text: string
  path: string[]
  matchSources: LibrarySearchMatchSource[]
}

export interface LibraryTagSummary {
  tag: string
  documentCount: number
  nodeCount: number
  items: LibraryNodeIndexItem[]
}

export interface LibraryTaskSummary {
  documentId: string
  documentTitle: string
  documentPath: string
  nodeId: string
  text: string
  checked: boolean
  path: string[]
  tags: string[]
}
