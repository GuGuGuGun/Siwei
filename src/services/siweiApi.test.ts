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
})
