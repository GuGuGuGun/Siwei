import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../../components/common/Toast'
import * as api from '../../services/siweiApi'
import { useLibraryStore } from './libraryStore'
import { LibraryWorkspace } from './LibraryWorkspace'

vi.mock('../../services/siweiApi', () => ({
  openFileDialog: vi.fn(),
  queryLibraryDocs: vi.fn(),
  addLibraryDoc: vi.fn(),
  removeLibraryDoc: vi.fn(),
  refreshLibraryDoc: vi.fn(),
  startLibraryRefresh: vi.fn(),
  getLibraryRefreshStatus: vi.fn(),
  cancelLibraryRefresh: vi.fn(),
  removeMissingLibraryDocs: vi.fn(),
  rebuildLibraryIndex: vi.fn(),
  queryLibrarySearch: vi.fn(),
  queryLibraryTags: vi.fn(),
  queryLibraryTasks: vi.fn(),
  toggleLibraryTask: vi.fn(),
  loadDocument: vi.fn(),
  addRecentDoc: vi.fn(),
}))

const apiMock = vi.mocked(api)

const failedDoc = {
  documentId: 'doc-1',
  title: '损坏文档',
  path: 'broken.siwei.json',
  updatedAt: 1,
  indexedAt: 2,
  fileMtime: 2,
  nodeCount: 0,
  taskCount: 0,
  uncheckedTaskCount: 0,
  tags: [],
  status: 'invalid' as const,
  errorSummary: '文档格式无法解析',
  failureReason: 'invalidJson' as const,
}

describe('LibraryWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    useLibraryStore.setState({
      activeView: 'docs',
      docs: [],
      docsHasMore: false,
      docsOffset: 0,
      docsStatusFilter: 'failed',
      docsKeyword: '',
      docsSortBy: 'updatedAt',
      searchQuery: '',
      searchResults: [],
      searchHasMore: false,
      searchOffset: 0,
      searchStatusFilter: 'all',
      searchFieldFilter: 'all',
      tags: [],
      tagsHasMore: false,
      tagsOffset: 0,
      tasks: [],
      tasksHasMore: false,
      tasksOffset: 0,
      taskFilter: 'all',
      selectedTag: null,
      refreshStatus: null,
      isLoading: false,
      error: null,
    })
    apiMock.queryLibraryDocs.mockResolvedValue({ items: [failedDoc], hasMore: false, total: 1 })
  })

  it('shows a degraded open-location action for failed documents', async () => {
    render(<LibraryWorkspace />)

    await waitFor(() => {
      expect(screen.getByText('损坏文档')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('打开文件位置'))

    expect(useToastStore.getState().toasts[0]).toMatchObject({
      type: 'info',
      message: '当前版本暂不支持打开文件位置，可先打开文档或复制路径定位。',
    })
  })
})
