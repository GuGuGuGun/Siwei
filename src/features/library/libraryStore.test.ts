import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/siweiApi'
import { createDocument } from '../../test/fixtures'
import { useDocumentStore } from '../document/documentStore'
import { useLibraryStore } from './libraryStore'

vi.mock('../../services/siweiApi', () => ({
  getLibraryDocs: vi.fn(),
  addLibraryDoc: vi.fn(),
  removeLibraryDoc: vi.fn(),
  refreshLibraryDoc: vi.fn(),
  refreshLibrary: vi.fn(),
  searchLibrary: vi.fn(),
  getLibraryTags: vi.fn(),
  getLibraryTasks: vi.fn(),
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
      searchQuery: '',
      searchResults: [],
      tags: [],
      tasks: [],
      taskFilter: 'all',
      selectedTag: null,
      isLoading: false,
      error: null,
    })
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
    apiMock.getLibraryDocs.mockResolvedValueOnce([libraryDoc])
    apiMock.addLibraryDoc.mockResolvedValueOnce({ ...libraryDoc, path: 'moved.siwei.json' })

    await useLibraryStore.getState().loadDocs()
    await useLibraryStore.getState().addDoc('moved.siwei.json')

    expect(useLibraryStore.getState().docs).toHaveLength(1)
    expect(useLibraryStore.getState().docs[0].path).toBe('moved.siwei.json')
  })

  it('searches with the stored query and records results', async () => {
    apiMock.searchLibrary.mockResolvedValueOnce([
      {
        documentId: 'doc-1',
        documentTitle: '测试文档',
        documentPath: 'demo.siwei.json',
        nodeId: 'node-2',
        text: '第二节点',
        path: [],
        matchSources: ['text'],
      },
    ])

    useLibraryStore.getState().setSearchQuery('节点')
    await useLibraryStore.getState().search()

    expect(apiMock.searchLibrary).toHaveBeenCalledWith('节点')
    expect(useLibraryStore.getState().searchResults[0].nodeId).toBe('node-2')
  })

  it('opens indexed node through documentStore load and focus', async () => {
    apiMock.loadDocument.mockResolvedValueOnce(createDocument())
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    await useLibraryStore.getState().openIndexedNode('demo.siwei.json', 'node-2')

    expect(apiMock.loadDocument).toHaveBeenCalledWith('demo.siwei.json')
    expect(useDocumentStore.getState().selectedNodeId).toBe('node-2')
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
