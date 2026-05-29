export type DefaultViewMode = 'outline' | 'mindmap' | 'split'
export type ThemeMode = 'light' | 'dark' | 'system'
export type AgentThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type AgentContextScope = 'currentDocument'

export interface AgentSettings {
  enabled: boolean
  provider: string
  model: string
  baseUrl: string
  thinkingLevel: AgentThinkingLevel
  contextScope: AgentContextScope
}

export interface AppSettings {
  autoSaveEnabled: boolean
  autoSaveIntervalMs: number
  defaultViewMode: DefaultViewMode
  sidebarCollapsed: boolean
  theme: ThemeMode
  focusMode: boolean
  agent: AgentSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: true,
  autoSaveIntervalMs: 1500,
  defaultViewMode: 'outline',
  sidebarCollapsed: false,
  theme: 'system',
  focusMode: false,
  agent: {
    enabled: false,
    provider: 'openai-compatible',
    model: 'gpt-4.1',
    baseUrl: 'https://api.openai.com/v1',
    thinkingLevel: 'medium',
    contextScope: 'currentDocument',
  },
}
