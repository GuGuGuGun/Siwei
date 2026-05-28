import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/siweiApi'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { useSettingsStore } from './settingsStore'

vi.mock('../../services/siweiApi', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}))

const apiMock = vi.mocked(api)

describe('settingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      isLoaded: false,
      isSaving: false,
      error: null,
    })
  })

  it('loads default settings when backend returns defaults', async () => {
    apiMock.getSettings.mockResolvedValueOnce(DEFAULT_SETTINGS)

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useSettingsStore.getState().isLoaded).toBe(true)
  })

  it('saves changed values immediately', async () => {
    apiMock.updateSettings.mockImplementation(async (settings) => settings)

    await useSettingsStore.getState().updateSettings({ autoSaveIntervalMs: 2500 })

    expect(apiMock.updateSettings).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      autoSaveIntervalMs: 2500,
    })
    expect(useSettingsStore.getState().settings.autoSaveIntervalMs).toBe(2500)
  })

  it('rolls back optimistic changes when saving fails', async () => {
    apiMock.updateSettings.mockRejectedValueOnce(new Error('写入失败'))

    await expect(
      useSettingsStore.getState().updateSettings({ sidebarCollapsed: true }),
    ).rejects.toThrow('写入失败')

    expect(useSettingsStore.getState().settings.sidebarCollapsed).toBe(false)
    expect(useSettingsStore.getState().error).toContain('写入失败')
  })
})
