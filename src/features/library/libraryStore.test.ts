import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/siweiApi'
import { useWorkspaceStore } from '../../app/workspaceStore'
import { createDocument } from '../../test/fixtures'
import { useDocumentStore } from '../document/documentStore'
import { useLibraryStore } from './libraryStore'

vi.mock('../../services/siweiApi', () => ({
  getLibraryDocs: vi.fn(),
  queryLibraryDocs: vi.fn(),
  addLibraryDoc: vi.fn(),
  removeLibraryDoc: vi.fn(),
  refreshLibraryDoc: vi.fn(),
  refreshLibrary: vi.fn(),
  startLibraryRefresh: vi.fn(),
  getLibraryRefreshStatus: vi.fn(),
  cancelLibraryRefresh: vi.fn(),
  removeMissingLibraryDocs: vi.fn(),
  searchLibrary: vi.fn(),
  queryLibrarySearch: vi.fn(),
  getLibraryTags: vi.fn(),
  queryLibraryTags: vi.fn(),
  getLibraryTasks: vi.fn(),
  queryLibraryTasks: vi.fn(),
  rebuildLibraryIndex: vi.fn(),
  toggleLibraryTask: vi.fn(),
  loadDocument: vi.fn(),
  addRecentDoc: vi.fn(),
}))

const apiMock = vi.mocked(api)

const libraryDoc = {
  documentId: 'doc-1',
  title: '测试文档',
  path: 'demo.siwei.json',
  updatedAt: 1,
  indexedAt: 2,
  fileMtime: 2,
  nodeCount: 2,
  taskCount: 1,
  uncheckedTaskCount: 1,
  tags: ['工作'],
  status: 'ready' as const,
}

const task = {
  documentId: 'doc-1',
  documentTitle: '测试文档',
  documentPath: 'demo.siwei.json',
  nodeId: 'node-2',
  text: '第二节点',
  checked: false,
  path: [],
  tags: ['工作'],
}

describe('libraryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLibraryStore.setState({
      activeView: null,
      docs: [],
      docsHasMore: false,
      docsOffset: 0,
      docsStatusFilter: 'all',
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
    useWorkspaceStore.setState({ activeView: 'library' })
    useDocumentStore.setState({
      currentDoc: null,
      viewMode: 'outline',
      selectedNodeId: null,
      collapsedNodeIds: new Set<string>(),
      isDirty: false,
      saveStatus: 'idle',
      currentFilePath: null,
      filter: { query: '', tag: null, checked: 'all' },
      focusedNodeId: null,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
    })
  })

  it('loads and upserts library documents by documentId', async () => {
    apiMock.queryLibraryDocs.mockResolvedValueOnce({ items: [libraryDoc], hasMore: false, total: 1 })
    apiMock.addLibraryDoc.mockResolvedValueOnce({ ...libraryDoc, path: 'moved.siwei.json' })

    await useLibraryStore.getState().loadDocs()
    await useLibraryStore.getState().addDoc('moved.siwei.json')

    expect(useLibraryStore.getState().docs).toHaveLength(1)
    expect(useLibraryStore.getState().docs[0].path).toBe('moved.siwei.json')
  })

  it('searches with the stored query and records results', async () => {
    apiMock.queryLibrarySearch.mockResolvedValueOnce({
      hasMore: false,
      total: 1,
      items: [
      {
        documentId: 'doc-1',
        documentTitle: '测试文档',
        documentPath: 'demo.siwei.json',
        nodeId: 'node-2',
        text: '第二节点',
        path: [],
        matchSources: ['content'],
      },
      ],
    })

    useLibraryStore.getState().setSearchQuery('节点')
    await useLibraryStore.getState().search()

    expect(apiMock.queryLibrarySearch).toHaveBeenCalledWith({
      query: '节点',
      limit: 50,
      offset: 0,
      documentStatus: 'all',
      matchedField: 'all',
    })
    expect(useLibraryStore.getState().searchResults[0].nodeId).toBe('node-2')
  })

  it('loads more documents with the current pagination query', async () => {
    apiMock.queryLibraryDocs
      .mockResolvedValueOnce({ items: [libraryDoc], hasMore: true, total: 2 })
      .mockResolvedValueOnce({
        items: [{ ...libraryDoc, documentId: 'doc-2', path: 'next.siwei.json' }],
        hasMore: false,
        total: 2,
      })

    await useLibraryStore.getState().loadDocs()
    await useLibraryStore.getState().loadMoreDocs()

    expect(apiMock.queryLibraryDocs).toHaveBeenNthCalledWith(2, {
      limit: 50,
      offset: 1,
      sortBy: 'updatedAt',
      sortDirection: 'desc',
      status: 'all',
      keyword: undefined,
    })
    expect(useLibraryStore.getState().docs).toHaveLength(2)
  })

  it('starts a refresh job and stores the returned progress', async () => {
    apiMock.startLibraryRefresh.mockResolvedValueOnce('job-1')
    apiMock.getLibraryRefreshStatus.mockResolvedValueOnce({
      jobId: 'job-1',
      status: 'running',
      total: 1,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      startedAt: 1,
    })

    await useLibraryStore.getState().startRefreshJob()

    expect(useLibraryStore.getState().refreshStatus?.jobId).toBe('job-1')
    expect(useLibraryStore.getState().refreshStatus?.status).toBe('running')
  })

  it('polls a finished refresh job and reloads documents', async () => {
    useLibraryStore.setState({
      refreshStatus: {
        jobId: 'job-1',
        status: 'running',
        total: 1,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        startedAt: 1,
      },
    })
    apiMock.getLibraryRefreshStatus.mockResolvedValueOnce({
      jobId: 'job-1',
      status: 'completed',
      total: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      errors: [],
      startedAt: 1,
      finishedAt: 2,
    })
    apiMock.queryLibraryDocs.mockResolvedValueOnce({ items: [libraryDoc], hasMore: false, total: 1 })

    await useLibraryStore.getState().pollRefreshJob()

    expect(apiMock.queryLibraryDocs).toHaveBeenCalled()
    expect(useLibraryStore.getState().docs).toHaveLength(1)
    expect(useLibraryStore.getState().refreshStatus?.status).toBe('completed')
  })

  it('opens indexed node through documentStore load and focus', async () => {
    apiMock.loadDocument.mockResolvedValueOnce(createDocument())
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    await useLibraryStore.getState().openIndexedNode('demo.siwei.json', 'node-2')

    expect(apiMock.loadDocument).toHaveBeenCalledWith('demo.siwei.json')
    expect(useDocumentStore.getState().selectedNodeId).toBe('node-2')
    expect(useWorkspaceStore.getState().activeView).toBe('editor')
    expect(useLibraryStore.getState().activeView).toBeNull()
  })

  it('does not optimistically update a failed global task toggle', async () => {
    useLibraryStore.setState({ tasks: [task] })
    apiMock.toggleLibraryTask.mockRejectedValueOnce(new Error('写回失败'))

    await expect(useLibraryStore.getState().toggleTask(task, true)).rejects.toThrow('写回失败')

    expect(useLibraryStore.getState().tasks[0].checked).toBe(false)
    expect(useLibraryStore.getState().error).toContain('写回失败')
  })
})
