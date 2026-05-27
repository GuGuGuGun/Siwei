import { create } from 'zustand'

import * as api from '../../services/siweiApi'
import type {
  LibraryDocumentItem,
  LibrarySearchResult,
  LibraryTagSummary,
  LibraryTaskSummary,
} from '../../types/library'
import { useDocumentStore } from '../document/documentStore'

export type LibraryView = 'docs' | 'search' | 'tags' | 'tasks'
export type LibraryTaskFilter = 'all' | 'unchecked' | 'checked'

interface LibraryState {
  activeView: LibraryView | null
  docs: LibraryDocumentItem[]
  searchQuery: string
  searchResults: LibrarySearchResult[]
  tags: LibraryTagSummary[]
  tasks: LibraryTaskSummary[]
  taskFilter: LibraryTaskFilter
  selectedTag: string | null
  isLoading: boolean
  error: string | null

  setActiveView: (view: LibraryView | null) => void
  loadDocs: () => Promise<void>
  addDoc: (path: string) => Promise<void>
  removeDoc: (path: string) => Promise<void>
  refreshDoc: (path: string) => Promise<void>
  refreshAll: () => Promise<void>
  rebuildIndex: () => Promise<void>
  setSearchQuery: (query: string) => void
  search: (query?: string) => Promise<void>
  loadTags: () => Promise<void>
  loadTasks: () => Promise<void>
  setTaskFilter: (filter: LibraryTaskFilter) => void
  setSelectedTag: (tag: string | null) => void
  toggleTask: (task: LibraryTaskSummary, checked: boolean) => Promise<void>
  openIndexedNode: (path: string, nodeId?: string) => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  activeView: null,
  docs: [],
  searchQuery: '',
  searchResults: [],
  tags: [],
  tasks: [],
  taskFilter: 'all',
  selectedTag: null,
  isLoading: false,
  error: null,

  setActiveView: (activeView) => set({ activeView }),

  loadDocs: async () => {
    await runLibraryAction(set, async () => {
      set({ docs: await api.getLibraryDocs() })
    })
  },

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
      set({ searchResults: await api.searchLibrary(effectiveQuery) })
    })
  },

  loadTags: async () => {
    await runLibraryAction(set, async () => {
      set({ tags: await api.getLibraryTags() })
    })
  },

  loadTasks: async () => {
    await runLibraryAction(set, async () => {
      set({ tasks: await api.getLibraryTasks() })
    })
  },

  setTaskFilter: (taskFilter) => set({ taskFilter }),
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
    set({ activeView: null })
  },
}))

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
