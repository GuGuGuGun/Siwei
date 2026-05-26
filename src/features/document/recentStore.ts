import { create } from 'zustand'
import { RecentDocItem } from '../../types/document'
import * as api from '../../services/siweiApi'

interface RecentState {
  recentDocs: RecentDocItem[]
  loadRecents: () => Promise<void>
  addRecent: (item: RecentDocItem) => Promise<void>
  removeRecent: (path: string) => Promise<void>
}

export const useRecentStore = create<RecentState>((set) => ({
  recentDocs: [],
  loadRecents: async () => {
    try {
      const items = await api.getRecentDocs()
      set({ recentDocs: items })
    } catch (error) {
      console.error('Error loading recent docs:', error)
    }
  },
  addRecent: async (item) => {
    try {
      await api.addRecentDoc(item)
      const items = await api.getRecentDocs()
      set({ recentDocs: items })
    } catch (error) {
      console.error('Error adding recent doc:', error)
    }
  },
  removeRecent: async (path) => {
    try {
      await api.removeRecentDoc(path)
      const items = await api.getRecentDocs()
      set({ recentDocs: items })
    } catch (error) {
      console.error('Error removing recent doc:', error)
    }
  },
}))
