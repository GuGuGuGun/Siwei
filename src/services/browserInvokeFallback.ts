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
  const lowerText = node.text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const start = lowerText.indexOf(lowerQuery)

  if (start >= 0) {
    results.push({
      nodeId: node.id,
      text: node.text,
      path,
      matchIndices: [[start, start + query.length]],
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
