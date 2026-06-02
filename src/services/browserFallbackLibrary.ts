import type { SearchResult } from '../types/document'
import type { LibraryPage, LibrarySearchResult } from '../types/library'

interface BrowserFallbackSearchState {
  documentId: string
  documentTitle: string
  documentPath: string
}

export function searchLibraryFallback(
  query: string,
  state: BrowserFallbackSearchState,
  documentResults: SearchResult[],
): LibrarySearchResult[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []
  const results: LibrarySearchResult[] = []
  if (state.documentTitle.toLowerCase().includes(trimmed)) {
    const start = state.documentTitle.toLowerCase().indexOf(trimmed)
    results.push({
      documentId: state.documentId,
      documentTitle: state.documentTitle,
      documentPath: state.documentPath,
      documentStatus: 'ready',
      text: state.documentTitle,
      path: [],
      snippet: state.documentTitle,
      highlightRanges: [{ start, end: start + trimmed.length }],
      matchedFields: ['title'],
      matchSources: ['title'],
      location: {
        documentId: state.documentId,
        documentPath: state.documentPath,
        path: [],
        source: 'search',
      },
    })
  }

  documentResults.forEach((result) => {
    results.push({
      documentId: state.documentId,
      documentTitle: state.documentTitle,
      documentPath: state.documentPath,
      documentStatus: 'ready',
      nodeId: result.nodeId,
      text: result.text,
      path: result.path,
      snippet: result.text,
      highlightRanges: result.matchIndices.map(([start, end]) => ({ start, end })),
      matchedFields: result.matchSources.map((source) => source === 'text' ? 'content' : source),
      matchSources: result.matchSources.map((source) => source === 'text' ? 'content' : source),
      location: {
        documentId: state.documentId,
        documentPath: state.documentPath,
        nodeId: result.nodeId,
        path: result.path,
        source: 'search',
      },
    })
  })
  return results
}

export function page<T>(
  items: T[],
  query: { limit?: number; offset?: number } | undefined,
): LibraryPage<T> {
  const offset = query?.offset ?? 0
  const limit = query?.limit ?? 50
  return {
    items: items.slice(offset, offset + limit),
    hasMore: offset + limit < items.length,
    total: items.length,
  }
}
