import type { OutlineDocument, RecentDocItem, SearchResult } from '../types/document'
import type { AgentStatus } from '../features/agent/agentTypes'
import type { AppSettings } from '../types/settings'
import { DEFAULT_SETTINGS } from '../types/settings'
import type {
  LibraryDocumentItem,
  LibraryPage,
  LibraryRefreshStatus,
  LibrarySearchResult,
  LibraryTagSummary,
  LibraryTaskSummary,
} from '../types/library'
import {
  collectTags,
  collectTasks,
  countNodes,
  createDemoDocument,
  searchNode,
  updateNodeChecked,
} from './browserFallbackDocument'
import { page, searchLibraryFallback } from './browserFallbackLibrary'

type CommandArgs = Record<string, unknown> | undefined

const now = () => Date.now()

let currentDoc = createDemoDocument(now)
let recentDocs: RecentDocItem[] = []
let libraryDocs: LibraryDocumentItem[] = []
let refreshStatus: LibraryRefreshStatus | null = null
let settings: AppSettings = DEFAULT_SETTINGS
let agentStatus: AgentStatus = {
  available: false,
  running: false,
  streaming: false,
  sessionKey: null,
  model: null,
  error: '浏览器预览模式不支持 Pi 文档助理',
}

export async function browserInvokeFallback<T>(command: string, args?: CommandArgs): Promise<T> {
  switch (command) {
    case 'new_document':
      currentDoc = createDemoDocument(now)
      return currentDoc as T
    case 'save_document':
    case 'export_markdown':
    case 'export_json':
      if (args?.doc) {
        currentDoc = args.doc as OutlineDocument
      }
      return undefined as T
    case 'export_mindmap_asset':
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
    case 'get_settings':
      return settings as T
    case 'update_settings':
      if (args?.settings) {
        settings = args.settings as AppSettings
      }
      return settings as T
    case 'agent_start_session':
      agentStatus = {
        ...agentStatus,
        running: false,
        streaming: false,
        sessionKey: String(args?.sessionKey ?? ''),
      }
      return undefined as T
    case 'agent_send_message':
      agentStatus = {
        ...agentStatus,
        error: '浏览器预览模式不支持 Pi 文档助理',
      }
      return undefined as T
    case 'agent_abort':
      agentStatus = {
        ...agentStatus,
        streaming: false,
      }
      return undefined as T
    case 'agent_get_status':
      return agentStatus as T
    case 'agent_save_api_key':
    case 'agent_delete_api_key':
      return undefined as T
    case 'get_library_docs':
    case 'refresh_library':
    case 'rebuild_library_index':
      return libraryDocs as T
    case 'query_library_docs':
      return page(libraryDocs, args?.query as { limit?: number; offset?: number } | undefined) as T
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
      return searchLibrary(String(args?.query ?? '')) as T
    case 'query_library_search': {
      const query = args?.query as { query?: string; limit?: number; offset?: number } | undefined
      return page(searchLibrary(String(query?.query ?? '')), query) as T
    }
    case 'get_library_tags':
      return collectTags(currentDoc.root).map<LibraryTagSummary>((tag) => ({
        tag,
        documentCount: 1,
        nodeCount: 1,
        items: [],
      })) as T
    case 'query_library_tags': {
      const query = args?.query as { limit?: number; offset?: number } | undefined
      const tags = collectTags(currentDoc.root).map<LibraryTagSummary>((tag) => ({
        tag,
        documentCount: 1,
        nodeCount: 1,
        items: [],
      }))
      return page(tags, query) as T
    }
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
    case 'query_library_tasks': {
      const query = args?.query as { checked?: string; limit?: number; offset?: number } | undefined
      let tasks = collectTasks(currentDoc.root).map<LibraryTaskSummary>((task) => ({
        documentId: currentDoc.id,
        documentTitle: currentDoc.title,
        documentPath: libraryDocs[0]?.path ?? 'demo.siwei.json',
        nodeId: task.nodeId,
        text: task.text,
        checked: task.checked,
        path: task.path,
        tags: task.tags,
        documentStatus: 'ready',
        location: {
          documentId: currentDoc.id,
          documentPath: libraryDocs[0]?.path ?? 'demo.siwei.json',
          nodeId: task.nodeId,
          path: task.path,
          source: 'task',
        },
      }))
      if (query?.checked === 'checked') tasks = tasks.filter((task) => task.checked)
      if (query?.checked === 'unchecked') tasks = tasks.filter((task) => !task.checked)
      return page(tasks, query) as T
    }
    case 'start_library_refresh':
      refreshStatus = {
        jobId: `browser-refresh-${now()}`,
        status: 'running',
        total: libraryDocs.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        currentPath: libraryDocs[0]?.path,
        updatedAt: now(),
        cancelled: false,
        errors: [],
        startedAt: now(),
      }
      return refreshStatus.jobId as T
    case 'get_library_refresh_status':
      if (!refreshStatus) throw new Error('刷新任务不存在')
      if (refreshStatus.status === 'running') {
        refreshStatus = {
          ...refreshStatus,
          status: 'completed',
          processed: refreshStatus.total,
          succeeded: refreshStatus.total,
          currentPath: undefined,
          updatedAt: now(),
          finishedAt: now(),
        }
      }
      return refreshStatus as T
    case 'cancel_library_refresh':
      if (!refreshStatus) throw new Error('刷新任务不存在')
      if (refreshStatus.status === 'running') {
        refreshStatus = {
          ...refreshStatus,
          status: 'cancelled',
          skipped: Math.max(refreshStatus.total - refreshStatus.processed, 0),
          currentPath: undefined,
          updatedAt: now(),
          cancelled: true,
          finishedAt: now(),
        }
      }
      return refreshStatus as T
    case 'remove_missing_library_docs':
      libraryDocs = libraryDocs.filter((doc) => doc.status !== 'missing')
      return libraryDocs as T
    case 'toggle_library_task': {
      const nodeId = String(args?.nodeId ?? '')
      const checked = Boolean(args?.checked)
      updateNodeChecked(currentDoc.root, nodeId, checked, now)
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

function searchLibrary(query: string): LibrarySearchResult[] {
  const documentResults: SearchResult[] = []
  searchNode(currentDoc.root, query, [], documentResults)
  return searchLibraryFallback(query, {
      documentId: currentDoc.id,
      documentTitle: currentDoc.title,
      documentPath: libraryDocs[0]?.path ?? 'demo.siwei.json',
    },
    documentResults,
  )
}
