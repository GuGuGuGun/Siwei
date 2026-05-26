import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecentStore } from './recentStore'
import * as api from '../../services/siweiApi'

vi.mock('../../services/siweiApi', () => ({
  getRecentDocs: vi.fn(),
  addRecentDoc: vi.fn(),
  removeRecentDoc: vi.fn(),
}))

const apiMock = vi.mocked(api)

describe('recentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRecentStore.setState({ recentDocs: [] })
  })

  it('refreshes the list after removing an invalid recent document', async () => {
    apiMock.removeRecentDoc.mockResolvedValueOnce(undefined)
    apiMock.getRecentDocs.mockResolvedValueOnce([
      { path: 'valid.siwei.json', title: '有效文档', lastOpenedAt: 2 },
    ])

    await useRecentStore.getState().removeRecent('missing.siwei.json')

    expect(apiMock.removeRecentDoc).toHaveBeenCalledWith('missing.siwei.json')
    expect(useRecentStore.getState().recentDocs).toEqual([
      { path: 'valid.siwei.json', title: '有效文档', lastOpenedAt: 2 },
    ])
  })
})
