import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLibraryStore } from '../library/libraryStore'
import { useRecentStore } from '../document/recentStore'
import { useWorkspaceStore } from '../../app/workspaceStore'
import { useSettingsStore } from './settingsStore'
import { SettingsPage } from './SettingsPage'
import type { AppSettings } from '../../types/settings'

const baseSettings: AppSettings = {
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

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({
      settings: baseSettings,
      isLoaded: true,
      isSaving: false,
      error: null,
    })
    useRecentStore.setState({
      recentDocs: [
        { path: 'a.siwei.json', title: 'A', lastOpenedAt: 1 },
        { path: 'b.siwei.json', title: 'B', lastOpenedAt: 2 },
      ],
    })
    useLibraryStore.setState({
      isLoading: false,
      error: null,
    })
    useWorkspaceStore.setState({ activeView: 'settings' })
  })

  it('updates auto-save and default view settings from controls', async () => {
    const updateSettings = vi.spyOn(useSettingsStore.getState(), 'updateSettings')
      .mockImplementation(async (patch) => {
        useSettingsStore.setState((state) => ({ settings: { ...state.settings, ...patch } }))
      })

    render(<SettingsPage />)

    fireEvent.click(screen.getByLabelText('已开启'))
    fireEvent.click(screen.getByRole('button', { name: '导图' }))

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ autoSaveEnabled: false })
      expect(updateSettings).toHaveBeenCalledWith({ defaultViewMode: 'mindmap' })
    })

    updateSettings.mockRestore()
  })

  it('updates theme and focus mode from interface controls', async () => {
    const updateSettings = vi.spyOn(useSettingsStore.getState(), 'updateSettings')
      .mockImplementation(async (patch) => {
        useSettingsStore.setState((state) => ({ settings: { ...state.settings, ...patch } }))
      })

    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    fireEvent.click(screen.getByRole('button', { name: '开启' }))

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' })
      expect(updateSettings).toHaveBeenCalledWith({ focusMode: true })
    })

    updateSettings.mockRestore()
  })

  it('runs data maintenance actions through existing stores', async () => {
    const removeRecent = vi.spyOn(useRecentStore.getState(), 'removeRecent').mockResolvedValue(undefined)
    const loadRecents = vi.spyOn(useRecentStore.getState(), 'loadRecents').mockResolvedValue(undefined)
    const rebuildIndex = vi.spyOn(useLibraryStore.getState(), 'rebuildIndex').mockResolvedValue(undefined)

    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: /清空最近记录/ }))
    fireEvent.click(screen.getByRole('button', { name: /重建索引/ }))

    await waitFor(() => {
      expect(removeRecent).toHaveBeenCalledWith('a.siwei.json')
      expect(removeRecent).toHaveBeenCalledWith('b.siwei.json')
      expect(loadRecents).toHaveBeenCalled()
      expect(rebuildIndex).toHaveBeenCalled()
    })

    removeRecent.mockRestore()
    loadRecents.mockRestore()
    rebuildIndex.mockRestore()
  })

  it('returns to the editor when closing settings', () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }))

    expect(useWorkspaceStore.getState().activeView).toBe('editor')
  })
})
