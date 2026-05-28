import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { createDocument } from '../test/fixtures'
import * as api from './siweiApi'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const invokeMock = vi.mocked(invoke)

describe('siweiApi', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
  })

  it('uses the stable save_document payload contract', async () => {
    const doc = createDocument()
    invokeMock.mockResolvedValueOnce(undefined)

    await api.saveDocument('demo.siwei.json', doc)

    expect(invokeMock).toHaveBeenCalledWith('save_document', {
      path: 'demo.siwei.json',
      doc,
    })
  })

  it('uses camelCase command payload fields for dialogs and search', async () => {
    const doc = createDocument()
    invokeMock.mockResolvedValue(undefined)

    await api.saveFileDialog('测试文档.siwei.json')
    await api.searchDocument(doc, '节点')

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'save_file_dialog', {
      defaultName: '测试文档.siwei.json',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'search_document', {
      doc,
      query: '节点',
    })
  })

  it('returns enhanced search result contracts from the stable wrapper', async () => {
    const doc = createDocument()
    invokeMock.mockResolvedValueOnce([
      {
        nodeId: 'node-1',
        text: '节点备注',
        path: [],
        matchIndices: [[0, 2]],
        matchSources: ['text', 'note', 'tag'],
        matches: [
          { source: 'text', value: '节点备注', matchIndices: [[0, 2]] },
          { source: 'note', value: '备注内容', matchIndices: [[0, 2]] },
          { source: 'tag', value: '备注', matchIndices: [[0, 2]] },
        ],
      },
    ])

    const results = await api.searchDocument(doc, '备注')

    expect(results[0].matchSources).toEqual(['text', 'note', 'tag'])
    expect(results[0].matches[2].value).toBe('备注')
  })

  it('wraps library commands with stable camelCase payload fields', async () => {
    invokeMock.mockResolvedValue(undefined)

    await api.addLibraryDoc('demo.siwei.json')
    await api.refreshLibraryDoc('demo.siwei.json')
    await api.searchLibrary('节点')
    await api.toggleLibraryTask('demo.siwei.json', 'node-1', true)

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'add_library_doc', {
      path: 'demo.siwei.json',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'refresh_library_doc', {
      path: 'demo.siwei.json',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'search_library', {
      query: '节点',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'toggle_library_task', {
      documentPath: 'demo.siwei.json',
      nodeId: 'node-1',
      checked: true,
    })
  })

  it('wraps v0.5.0 library query and refresh commands with stable payloads', async () => {
    invokeMock.mockResolvedValue(undefined)

    await api.queryLibraryDocs({ limit: 50, offset: 0, sortBy: 'updatedAt', status: 'ready' })
    await api.queryLibrarySearch({
      query: '节点',
      limit: 50,
      offset: 0,
      documentStatus: 'all',
      matchedField: 'content',
    })
    await api.queryLibraryTags({ limit: 50, offset: 0, sortBy: 'nodeCount' })
    await api.queryLibraryTasks({ limit: 50, offset: 0, checked: 'unchecked' })
    await api.startLibraryRefresh()
    await api.getLibraryRefreshStatus('job-1')
    await api.cancelLibraryRefresh('job-1')
    await api.removeMissingLibraryDocs()

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'query_library_docs', {
      query: { limit: 50, offset: 0, sortBy: 'updatedAt', status: 'ready' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'query_library_search', {
      query: {
        query: '节点',
        limit: 50,
        offset: 0,
        documentStatus: 'all',
        matchedField: 'content',
      },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'query_library_tags', {
      query: { limit: 50, offset: 0, sortBy: 'nodeCount' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'query_library_tasks', {
      query: { limit: 50, offset: 0, checked: 'unchecked' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'start_library_refresh', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'get_library_refresh_status', { jobId: 'job-1' })
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'cancel_library_refresh', { jobId: 'job-1' })
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'remove_missing_library_docs', undefined)
  })

  it('wraps settings commands with stable camelCase payload fields', async () => {
    const settings = {
      autoSaveEnabled: false,
      autoSaveIntervalMs: 2500,
      defaultViewMode: 'split' as const,
      sidebarCollapsed: true,
    }
    invokeMock.mockResolvedValue(settings)

    await api.getSettings()
    await api.updateSettings(settings)

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_settings', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'update_settings', { settings })
  })
})
