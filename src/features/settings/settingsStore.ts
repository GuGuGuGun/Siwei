import { create } from 'zustand'

import * as api from '../../services/siweiApi'
import { DEFAULT_SETTINGS, AppSettings } from '../../types/settings'

interface SettingsState {
  settings: AppSettings
  isLoaded: boolean
  isSaving: boolean
  error: string | null
  loadSettings: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  isSaving: false,
  error: null,

  loadSettings: async () => {
    try {
      const settings = await api.getSettings()
      set({ settings, isLoaded: true, error: null })
    } catch (error) {
      set({ settings: DEFAULT_SETTINGS, isLoaded: true, error: String(error) })
      throw error
    }
  },

  updateSettings: async (patch) => {
    const previous = get().settings
    const next = { ...previous, ...patch }

    set({ settings: next, isSaving: true, error: null })
    try {
      const saved = await api.updateSettings(next)
      set({ settings: saved, isSaving: false, error: null })
    } catch (error) {
      set({ settings: previous, isSaving: false, error: String(error) })
      throw error
    }
  },
}))
