import { create } from 'zustand'

import * as api from '../../services/siweiApi'
import { useWorkspaceStore } from '../../app/workspaceStore'
import type {
  LibraryDocumentQuery,
  LibraryDocumentItem,
  LibraryLocation,
  LibraryRefreshStatus,
  LibrarySearchQuery,
  LibrarySearchResult,
  LibraryTagSummary,
  LibraryTaskQuery,
  LibraryTaskSummary,
} from '../../types/library'
import { useDocumentStore } from '../document/documentStore'

export type LibraryView = 'docs' | 'search' | 'tags' | 'tasks'
export type LibraryTaskFilter = 'all' | 'unchecked' | 'checked'
export type LibraryStatusFilter = 'all' | LibraryDocumentItem['status']
export type LibraryMatchedFieldFilter = 'all' | NonNullable<LibrarySearchResult['matchedFields']>[number]

const PAGE_SIZE = 50

interface LibraryState {
  activeView: LibraryView | null
  docs: LibraryDocumentItem[]
  docsHasMore: boolean
  docsOffset: number
  docsStatusFilter: LibraryStatusFilter
  docsKeyword: string
  docsSortBy: NonNullable<LibraryDocumentQuery['sortBy']>
  searchQuery: string
  searchResults: LibrarySearchResult[]
  searchHasMore: boolean
  searchOffset: number
  searchStatusFilter: LibraryStatusFilter
  searchFieldFilter: LibraryMatchedFieldFilter
  tags: LibraryTagSummary[]
  tagsHasMore: boolean
  tagsOffset: number
  tasks: LibraryTaskSummary[]
  tasksHasMore: boolean
  tasksOffset: number
  taskFilter: LibraryTaskFilter
  selectedTag: string | null
  refreshStatus: LibraryRefreshStatus | null
  isLoading: boolean
  error: string | null

  setActiveView: (view: LibraryView | null) => void
  loadDocs: () => Promise<void>
  loadMoreDocs: () => Promise<void>
  setDocsStatusFilter: (status: LibraryStatusFilter) => void
  setDocsKeyword: (keyword: string) => void
  setDocsSortBy: (sortBy: NonNullable<LibraryDocumentQuery['sortBy']>) => void
  addDoc: (path: string) => Promise<void>
  removeDoc: (path: string) => Promise<void>
  refreshDoc: (path: string) => Promise<void>
  refreshAll: () => Promise<void>
  startRefreshJob: () => Promise<void>
  pollRefreshJob: (jobId?: string) => Promise<void>
  cancelRefreshJob: () => Promise<void>
  removeMissingDocs: () => Promise<void>
  rebuildIndex: () => Promise<void>
  setSearchQuery: (query: string) => void
  search: (query?: string) => Promise<void>
  loadMoreSearchResults: () => Promise<void>
  setSearchStatusFilter: (status: LibraryStatusFilter) => void
  setSearchFieldFilter: (field: LibraryMatchedFieldFilter) => void
  loadTags: () => Promise<void>
  loadMoreTags: () => Promise<void>
  loadTasks: () => Promise<void>
  loadMoreTasks: () => Promise<void>
  setTaskFilter: (filter: LibraryTaskFilter) => void
  setSelectedTag: (tag: string | null) => void
  toggleTask: (task: LibraryTaskSummary, checked: boolean) => Promise<void>
  openIndexedNode: (path: string, nodeId?: string) => Promise<void>
  openLocation: (location: LibraryLocation) => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  activeView: null,
  docs: [],
  docsHasMore: false,
  docsOffset: 0,
  docsStatusFilter: 'all',
  docsKeyword: '',
  docsSortBy: 'updatedAt',
  searchQuery: '',
  searchResults: [],
  searchHasMore: false,
  searchOffset: 0,
  searchStatusFilter: 'all',
  searchFieldFilter: 'all',
  tags: [],
  tagsHasMore: false,
  tagsOffset: 0,
  tasks: [],
  tasksHasMore: false,
  tasksOffset: 0,
  taskFilter: 'all',
  selectedTag: null,
  refreshStatus: null,
  isLoading: false,
  error: null,

  setActiveView: (activeView) => set({ activeView }),

  loadDocs: async () => {
    await runLibraryAction(set, async () => {
      const page = await api.queryLibraryDocs(buildDocumentQuery(get(), 0))
      set({ docs: page.items, docsHasMore: page.hasMore, docsOffset: page.items.length })
    })
  },

  loadMoreDocs: async () => {
    const state = get()
    if (!state.docsHasMore || state.isLoading) return
    await runLibraryAction(set, async () => {
      const page = await api.queryLibraryDocs(buildDocumentQuery(get(), get().docsOffset))
      set((state) => ({
        docs: [...state.docs, ...page.items],
        docsHasMore: page.hasMore,
        docsOffset: state.docsOffset + page.items.length,
      }))
    })
  },

  setDocsStatusFilter: (docsStatusFilter) => set({ docsStatusFilter, docsOffset: 0 }),
  setDocsKeyword: (docsKeyword) => set({ docsKeyword, docsOffset: 0 }),
  setDocsSortBy: (docsSortBy) => set({ docsSortBy, docsOffset: 0 }),

  addDoc: async (path) => {
    await runLibraryAction(set, async () => {
      const item = await api.addLibraryDoc(path)
      set((state) => ({
        docs: [item, ...state.docs.filter((doc) => doc.documentId !== item.documentId)],
      }))
    })
  },

  removeDoc: async (path) => {
    await runLibraryAction(set, async () => {
      await api.removeLibraryDoc(path)
      set((state) => ({
        docs: state.docs.filter((doc) => doc.path !== path),
      }))
    })
  },

  refreshDoc: async (path) => {
    await runLibraryAction(set, async () => {
      const item = await api.refreshLibraryDoc(path)
      set((state) => ({
        docs: upsertDocument(state.docs, item),
      }))
    })
  },

  refreshAll: async () => {
    await runLibraryAction(set, async () => {
      set({ docs: await api.refreshLibrary() })
    })
  },

  startRefreshJob: async () => {
    await runLibraryAction(set, async () => {
      const jobId = await api.startLibraryRefresh()
      const refreshStatus = await api.getLibraryRefreshStatus(jobId)
      set({ refreshStatus })
    })
  },

  pollRefreshJob: async (jobId) => {
    const effectiveJobId = jobId ?? get().refreshStatus?.jobId
    if (!effectiveJobId) return

    const refreshStatus = await api.getLibraryRefreshStatus(effectiveJobId)
    const shouldReloadDocs = isRefreshFinished(refreshStatus.status)
    if (shouldReloadDocs) {
      const page = await api.queryLibraryDocs(buildDocumentQuery(get(), 0))
      set({
        refreshStatus,
        docs: page.items,
        docsHasMore: page.hasMore,
        docsOffset: page.items.length,
        error: null,
      })
      return
    }

    set({ refreshStatus, error: null })
  },

  cancelRefreshJob: async () => {
    const jobId = get().refreshStatus?.jobId
    if (!jobId) return
    await runLibraryAction(set, async () => {
      set({ refreshStatus: await api.cancelLibraryRefresh(jobId) })
    })
  },

  removeMissingDocs: async () => {
    await runLibraryAction(set, async () => {
      const docs = await api.removeMissingLibraryDocs()
      set({ docs, docsHasMore: false, docsOffset: docs.length })
    })
  },

  rebuildIndex: async () => {
    await runLibraryAction(set, async () => {
      set({ docs: await api.rebuildLibraryIndex() })
    })
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  search: async (query) => {
    const effectiveQuery = (query ?? get().searchQuery).trim()
    if (!effectiveQuery) {
      set({ searchResults: [], error: null })
      return
    }

    await runLibraryAction(set, async () => {
      const page = await api.queryLibrarySearch(buildSearchQuery(get(), effectiveQuery, 0))
      set({ searchResults: page.items, searchHasMore: page.hasMore, searchOffset: page.items.length })
    })
  },

  loadMoreSearchResults: async () => {
    const state = get()
    if (!state.searchHasMore || state.isLoading || !state.searchQuery.trim()) return
    await runLibraryAction(set, async () => {
      const page = await api.queryLibrarySearch(buildSearchQuery(get(), get().searchQuery.trim(), get().searchOffset))
      set((state) => ({
        searchResults: [...state.searchResults, ...page.items],
        searchHasMore: page.hasMore,
        searchOffset: state.searchOffset + page.items.length,
      }))
    })
  },

  setSearchStatusFilter: (searchStatusFilter) => set({ searchStatusFilter, searchOffset: 0 }),
  setSearchFieldFilter: (searchFieldFilter) => set({ searchFieldFilter, searchOffset: 0 }),

  loadTags: async () => {
    await runLibraryAction(set, async () => {
      const page = await api.queryLibraryTags({ limit: PAGE_SIZE, offset: 0, sortBy: 'nodeCount', sortDirection: 'desc' })
      set({ tags: page.items, tagsHasMore: page.hasMore, tagsOffset: page.items.length })
    })
  },

  loadMoreTags: async () => {
    const state = get()
    if (!state.tagsHasMore || state.isLoading) return
    await runLibraryAction(set, async () => {
      const page = await api.queryLibraryTags({ limit: PAGE_SIZE, offset: get().tagsOffset, sortBy: 'nodeCount', sortDirection: 'desc' })
      set((state) => ({
        tags: [...state.tags, ...page.items],
        tagsHasMore: page.hasMore,
        tagsOffset: state.tagsOffset + page.items.length,
      }))
    })
  },

  loadTasks: async () => {
    await runLibraryAction(set, async () => {
      const page = await api.queryLibraryTasks(buildTaskQuery(get(), 0))
      set({ tasks: page.items, tasksHasMore: page.hasMore, tasksOffset: page.items.length })
    })
  },

  loadMoreTasks: async () => {
    const state = get()
    if (!state.tasksHasMore || state.isLoading) return
    await runLibraryAction(set, async () => {
      const page = await api.queryLibraryTasks(buildTaskQuery(get(), get().tasksOffset))
      set((state) => ({
        tasks: [...state.tasks, ...page.items],
        tasksHasMore: page.hasMore,
        tasksOffset: state.tasksOffset + page.items.length,
      }))
    })
  },

  setTaskFilter: (taskFilter) => set({ taskFilter, tasksOffset: 0 }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),

  toggleTask: async (task, checked) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await api.toggleLibraryTask(task.documentPath, task.nodeId, checked)
      set((state) => ({
        tasks: state.tasks.map((item) =>
          item.documentPath === updated.documentPath && item.nodeId === updated.nodeId
            ? updated
            : item,
        ),
        isLoading: false,
      }))
      await get().refreshDoc(task.documentPath)
    } catch (error) {
      set({ isLoading: false, error: String(error) })
      throw error
    }
  },

  openIndexedNode: async (path, nodeId) => {
    await useDocumentStore.getState().loadDoc(path)
    if (nodeId) {
      useDocumentStore.getState().focusNode(nodeId)
    }
    useWorkspaceStore.getState().setActiveView('editor')
    set({ activeView: null })
  },

  openLocation: async (location) => {
    await get().openIndexedNode(location.documentPath, location.nodeId)
  },
}))

function buildDocumentQuery(state: LibraryState, offset: number): LibraryDocumentQuery {
  return {
    limit: PAGE_SIZE,
    offset,
    sortBy: state.docsSortBy,
    sortDirection: state.docsSortBy === 'title' ? 'asc' : 'desc',
    status: state.docsStatusFilter,
    keyword: state.docsKeyword.trim() || undefined,
  }
}

function buildSearchQuery(
  state: LibraryState,
  query: string,
  offset: number,
): LibrarySearchQuery {
  return {
    query,
    limit: PAGE_SIZE,
    offset,
    documentStatus: state.searchStatusFilter,
    matchedField: state.searchFieldFilter,
  }
}

function buildTaskQuery(state: LibraryState, offset: number): LibraryTaskQuery {
  return {
    limit: PAGE_SIZE,
    offset,
    checked: state.taskFilter,
  }
}

async function runLibraryAction(
  set: (partial: Partial<LibraryState> | ((state: LibraryState) => Partial<LibraryState>)) => void,
  action: () => Promise<void>,
) {
  set({ isLoading: true, error: null })
  try {
    await action()
    set({ isLoading: false })
  } catch (error) {
    set({ isLoading: false, error: String(error) })
    throw error
  }
}

function upsertDocument(
  docs: LibraryDocumentItem[],
  item: LibraryDocumentItem,
): LibraryDocumentItem[] {
  return [item, ...docs.filter((doc) => doc.documentId !== item.documentId)]
}

function isRefreshFinished(status: LibraryRefreshStatus['status']): boolean {
  return status === 'completed' ||
    status === 'completedWithErrors' ||
    status === 'cancelled' ||
    status === 'failed'
}
