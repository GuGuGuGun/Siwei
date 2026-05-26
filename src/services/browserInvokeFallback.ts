import type { OutlineDocument, RecentDocItem, SearchResult } from '../types/document'

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
    default:
      throw new Error(`Unsupported browser fallback command: ${command}`)
  }
}
