import { create } from 'zustand'

export type WorkspaceView = 'editor' | 'library' | 'settings'

interface WorkspaceState {
  activeView: WorkspaceView
  setActiveView: (view: WorkspaceView) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeView: 'editor',
  setActiveView: (activeView) => set({ activeView }),
}))
