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
})
