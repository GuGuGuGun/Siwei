import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceStore } from '../../app/workspaceStore'
import { useSettingsStore } from '../../features/settings/settingsStore'
import { Sidebar } from './Sidebar'
import type { AppSettings } from '../../types/settings'

const sidebarSettings: AppSettings = {
  autoSaveEnabled: true,
  autoSaveIntervalMs: 1500,
  defaultViewMode: 'outline',
  sidebarCollapsed: false,
  theme: 'system',
  focusMode: false,
  experimentalMindMapLayoutEngine: false,
  agent: {
    enabled: false,
    provider: 'openai-compatible',
    model: 'gpt-4.1',
    baseUrl: 'https://api.openai.com/v1',
    thinkingLevel: 'medium',
    contextScope: 'currentDocument',
  },
}

vi.mock('../../services/siweiApi', () => ({
  getRecentDocs: vi.fn(async () => []),
  openFileDialog: vi.fn(),
  removeRecentDoc: vi.fn(),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeView: 'editor' })
    useSettingsStore.setState({
      settings: sidebarSettings,
      isLoaded: true,
      isSaving: false,
      error: null,
    })
  })

  it('switches to settings workspace and highlights the settings button', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(useWorkspaceStore.getState().activeView).toBe('settings')
    expect(screen.getByRole('button', { name: '设置' })).toHaveClass('bg-white')
  })
})
