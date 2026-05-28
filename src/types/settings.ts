export type DefaultViewMode = 'outline' | 'mindmap' | 'split'

export interface AppSettings {
  autoSaveEnabled: boolean
  autoSaveIntervalMs: number
  defaultViewMode: DefaultViewMode
  sidebarCollapsed: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: true,
  autoSaveIntervalMs: 1500,
  defaultViewMode: 'outline',
  sidebarCollapsed: false,
}
