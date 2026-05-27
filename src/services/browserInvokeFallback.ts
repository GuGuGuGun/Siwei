import type { OutlineDocument, RecentDocItem, SearchResult } from '../types/document'
import type {
  LibraryDocumentItem,
  LibrarySearchResult,
  LibraryTagSummary,
  LibraryTaskSummary,
} from '../types/library'

type CommandArgs = Record<string, unknown> | undefined

const now = () => Date.now()

function createDemoDocument(): OutlineDocument {
  const timestamp = now()

  return {
    id: 'demo-doc',
    title: '未命名文档',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    root: {
      id: 'demo-root',
      text: '未命名文档',
      createdAt: timestamp,
      updatedAt: timestamp,
      children: [
        {
          id: 'demo-node-1',
          text: '开始记录你的想法',
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [],
        },
      ],
    },
  }
}

let currentDoc = createDemoDocument()
let recentDocs: RecentDocItem[] = []
let libraryDocs: LibraryDocumentItem[] = []

function searchNode(
  node: OutlineDocument['root'],
  query: string,
  path: string[],
  results: SearchResult[],
) {
  const lowerQuery = query.toLowerCase()
  const findRanges = (value: string): Array<[number, number]> => {
    const lowerValue = value.toLowerCase()
    const ranges: Array<[number, number]> = []
    let offset = 0
    while (offset <= lowerValue.length) {
      const start = lowerValue.indexOf(lowerQuery, offset)
      if (start < 0) break
      const end = start + query.length
      ranges.push([start, end])
      offset = end
    }
    return ranges
  }

  const textMatches = findRanges(node.text)
  const noteMatches = node.note ? findRanges(node.note) : []
  const tagMatches = (node.tags ?? [])
    .map((tagValue) => ({
      source: 'tag' as const,
      value: tagValue,
      matchIndices: findRanges(tagValue),
    }))
    .filter((match) => match.matchIndices.length > 0)

  if (textMatches.length > 0 || noteMatches.length > 0 || tagMatches.length > 0) {
    const matches: SearchResult['matches'] = []
    const matchSources: SearchResult['matchSources'] = []

    if (textMatches.length > 0) {
      matchSources.push('text')
      matches.push({ source: 'text', value: node.text, matchIndices: textMatches })
    }
    if (noteMatches.length > 0) {
      matchSources.push('note')
      matches.push({ source: 'note', value: node.note ?? '', matchIndices: noteMatches })
    }
    if (tagMatches.length > 0) {
      matchSources.push('tag')
      matches.push(...tagMatches)
    }

    results.push({
      nodeId: node.id,
      text: node.text,
      path,
      matchIndices: textMatches,
      matchSources,
      matches,
    })
  }

  node.children.forEach((child) => searchNode(child, query, [...path, node.text], results))
}

export async function browserInvokeFallback<T>(command: string, args?: CommandArgs): Promise<T> {
  switch (command) {
    case 'new_document':
      currentDoc = createDemoDocument()
      return currentDoc as T
    case 'save_document':
    case 'export_markdown':
    case 'export_json':
      if (args?.doc) {
        currentDoc = args.doc as OutlineDocument
      }
      return undefined as T
    case 'load_document':
    case 'import_json':
    case 'import_markdown':
      return currentDoc as T
    case 'get_recent_docs':
      return recentDocs as T
    case 'add_recent_doc':
      if (args?.item) {
        const item = args.item as RecentDocItem
        recentDocs = [item, ...recentDocs.filter((recent) => recent.path !== item.path)].slice(0, 20)
      }
      return undefined as T
    case 'remove_recent_doc':
      if (typeof args?.path === 'string') {
        recentDocs = recentDocs.filter((item) => item.path !== args.path)
      }
      return undefined as T
    case 'open_file_dialog':
    case 'save_file_dialog':
      return null as T
    case 'search_document': {
      const doc = (args?.doc as OutlineDocument | undefined) ?? currentDoc
      const query = String(args?.query ?? '').trim()
      if (!query) return [] as T

      const results: SearchResult[] = []
      searchNode(doc.root, query, [], results)
      return results as T
    }
    case 'get_library_docs':
    case 'refresh_library':
    case 'rebuild_library_index':
      return libraryDocs as T
    case 'add_library_doc':
    case 'refresh_library_doc': {
      const path = String(args?.path ?? 'demo.siwei.json')
      const item: LibraryDocumentItem = {
        documentId: currentDoc.id,
        title: currentDoc.title,
        path,
        updatedAt: currentDoc.updatedAt,
        indexedAt: now(),
        fileMtime: now(),
        nodeCount: countNodes(currentDoc.root),
        taskCount: collectTasks(currentDoc.root).length,
        uncheckedTaskCount: collectTasks(currentDoc.root).filter((task) => !task.checked).length,
        tags: collectTags(currentDoc.root),
        status: 'ready',
      }
      libraryDocs = [item, ...libraryDocs.filter((doc) => doc.documentId !== item.documentId)]
      return item as T
    }
    case 'remove_library_doc':
      if (typeof args?.path === 'string') {
        libraryDocs = libraryDocs.filter((item) => item.path !== args.path)
      }
      return undefined as T
    case 'search_library':
      return searchLibraryFallback(String(args?.query ?? '')) as T
    case 'get_library_tags':
      return collectTags(currentDoc.root).map<LibraryTagSummary>((tag) => ({
        tag,
        documentCount: 1,
        nodeCount: 1,
        items: [],
      })) as T
    case 'get_library_tasks':
      return collectTasks(currentDoc.root).map<LibraryTaskSummary>((task) => ({
        documentId: currentDoc.id,
        documentTitle: currentDoc.title,
        documentPath: libraryDocs[0]?.path ?? 'demo.siwei.json',
        nodeId: task.nodeId,
        text: task.text,
        checked: task.checked,
        path: task.path,
        tags: task.tags,
      })) as T
    case 'toggle_library_task': {
      const nodeId = String(args?.nodeId ?? '')
      const checked = Boolean(args?.checked)
      updateNodeChecked(currentDoc.root, nodeId, checked)
      return collectTasks(currentDoc.root)
        .map<LibraryTaskSummary>((task) => ({
          documentId: currentDoc.id,
          documentTitle: currentDoc.title,
          documentPath: String(args?.documentPath ?? 'demo.siwei.json'),
          nodeId: task.nodeId,
          text: task.text,
          checked: task.checked,
          path: task.path,
          tags: task.tags,
        }))
        .find((task) => task.nodeId === nodeId) as T
    }
    default:
      throw new Error(`Unsupported browser fallback command: ${command}`)
  }
}

function countNodes(node: OutlineDocument['root']): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0)
}

function collectTags(node: OutlineDocument['root']): string[] {
  const tags = new Set(node.tags ?? [])
  node.children.forEach((child) => collectTags(child).forEach((tag) => tags.add(tag)))
  return [...tags].sort()
}

function collectTasks(
  node: OutlineDocument['root'],
  path: string[] = [],
): Array<{ nodeId: string; text: string; checked: boolean; path: string[]; tags: string[] }> {
  const current = node.checked === undefined
    ? []
    : [{
        nodeId: node.id,
        text: node.text,
        checked: node.checked,
        path,
        tags: node.tags ?? [],
      }]
  return [
    ...current,
    ...node.children.flatMap((child) => collectTasks(child, [...path, node.text])),
  ]
}

function updateNodeChecked(node: OutlineDocument['root'], nodeId: string, checked: boolean): boolean {
  if (node.id === nodeId) {
    node.checked = checked
    node.updatedAt = now()
    return true
  }
  return node.children.some((child) => updateNodeChecked(child, nodeId, checked))
}

function searchLibraryFallback(query: string): LibrarySearchResult[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []
  const results: LibrarySearchResult[] = []
  if (currentDoc.title.toLowerCase().includes(trimmed)) {
    results.push({
      documentId: currentDoc.id,
      documentTitle: currentDoc.title,
      documentPath: libraryDocs[0]?.path ?? 'demo.siwei.json',
      text: currentDoc.title,
      path: [],
      matchSources: ['title'],
    })
  }
  const documentResults: SearchResult[] = []
  searchNode(currentDoc.root, trimmed, [], documentResults)
  documentResults.forEach((result) => {
    results.push({
      documentId: currentDoc.id,
      documentTitle: currentDoc.title,
      documentPath: libraryDocs[0]?.path ?? 'demo.siwei.json',
      nodeId: result.nodeId,
      text: result.text,
      path: result.path,
      matchSources: result.matchSources,
    })
  })
  return results
}
