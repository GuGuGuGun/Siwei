export type LibraryDocumentStatus =
  | 'ready'
  | 'stale'
  | 'missing'
  | 'invalid'
  | 'indexing'
  | 'error'

export type LibrarySortBy = 'updatedAt' | 'title' | 'taskCount' | 'tagCount' | 'status'
export type LibrarySortDirection = 'asc' | 'desc'

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

export interface LibraryPage<T> {
  items: T[]
  hasMore: boolean
  total?: number
}

export interface LibraryDocumentQuery {
  limit?: number
  offset?: number
  sortBy?: LibrarySortBy
  sortDirection?: LibrarySortDirection
  status?: LibraryDocumentStatus | 'all'
  keyword?: string
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

export type LibraryMatchedField = 'title' | 'content' | 'note' | 'tag'

export interface LibraryHighlightRange {
  start: number
  end: number
}

export interface LibraryLocation {
  documentId: string
  documentPath: string
  nodeId?: string
  path: string[]
  source: 'document' | 'search' | 'task' | 'tag'
}

export interface LibrarySearchResult {
  documentId: string
  documentTitle: string
  documentPath: string
  documentStatus?: LibraryDocumentStatus
  nodeId?: string
  text: string
  path: string[]
  snippet?: string
  highlightRanges?: LibraryHighlightRange[]
  matchedFields?: LibraryMatchedField[]
  matchSources: LibraryMatchedField[]
  score?: number
  location?: LibraryLocation
}

export interface LibrarySearchQuery {
  query: string
  limit?: number
  offset?: number
  documentStatus?: LibraryDocumentStatus | 'all'
  matchedField?: LibraryMatchedField | 'all'
}

export interface LibraryTagSummary {
  tag: string
  documentCount: number
  nodeCount: number
  items: LibraryNodeIndexItem[]
  location?: LibraryLocation
}

export interface LibraryTagQuery {
  limit?: number
  offset?: number
  sortBy?: 'tag' | 'nodeCount'
  sortDirection?: LibrarySortDirection
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
  documentStatus?: LibraryDocumentStatus
  location?: LibraryLocation
}

export interface LibraryTaskQuery {
  limit?: number
  offset?: number
  checked?: 'all' | 'checked' | 'unchecked'
}

export type LibraryRefreshJobStatus =
  | 'queued'
  | 'running'
  | 'cancelRequested'
  | 'cancelled'
  | 'completed'
  | 'completedWithErrors'
  | 'failed'

export interface LibraryRefreshErrorItem {
  documentId: string
  path: string
  status: Exclude<LibraryDocumentStatus, 'ready' | 'indexing'>
  message: string
  technicalMessage?: string
}

export interface LibraryRefreshStatus {
  jobId: string
  status: LibraryRefreshJobStatus
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
  errors: LibraryRefreshErrorItem[]
  startedAt: number
  finishedAt?: number
}
