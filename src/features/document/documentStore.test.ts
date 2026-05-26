import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDocumentStore } from './documentStore'
import { createDocument } from '../../test/fixtures'
import * as api from '../../services/siweiApi'

vi.mock('../../services/siweiApi', () => ({
  newDocument: vi.fn(),
  saveDocument: vi.fn(),
  loadDocument: vi.fn(),
  exportMarkdown: vi.fn(),
  exportJson: vi.fn(),
  importMarkdown: vi.fn(),
  importJson: vi.fn(),
  addRecentDoc: vi.fn(),
  saveFileDialog: vi.fn(),
}))

const apiMock = vi.mocked(api)

describe('documentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    useDocumentStore.setState({
      currentDoc: null,
      viewMode: 'outline',
      selectedNodeId: null,
      collapsedNodeIds: new Set<string>(),
      isDirty: false,
      saveStatus: 'idle',
      currentFilePath: null,
    })
  })

  it('syncs collapsed node ids into the saved document tree', async () => {
    const doc = createDocument()
    useDocumentStore.setState({
      currentDoc: doc,
      collapsedNodeIds: new Set(['node-1']),
      currentFilePath: 'demo.siwei.json',
      isDirty: true,
    })
    apiMock.saveDocument.mockResolvedValueOnce(undefined)
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    const saved = await useDocumentStore.getState().saveDoc()

    expect(saved).toBe(true)
    const savedDoc = apiMock.saveDocument.mock.calls[0][1]
    expect(savedDoc.root.children[0].collapsed).toBe(true)
    expect(savedDoc.root.children[1].collapsed).toBe(false)
    expect(useDocumentStore.getState().isDirty).toBe(false)
  })

  it('does not change path or dirty state when save dialog is cancelled', async () => {
    useDocumentStore.setState({
      currentDoc: createDocument(),
      currentFilePath: null,
      isDirty: true,
    })
    apiMock.saveFileDialog.mockResolvedValueOnce(null)

    const saved = await useDocumentStore.getState().saveDoc()

    expect(saved).toBe(false)
    expect(apiMock.saveDocument).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().currentFilePath).toBeNull()
    expect(useDocumentStore.getState().isDirty).toBe(true)
  })

  it('keeps newer edits dirty when an older save finishes late', async () => {
    const originalDoc = createDocument()
    useDocumentStore.setState({
      currentDoc: originalDoc,
      currentFilePath: 'demo.siwei.json',
      isDirty: true,
    })
    apiMock.saveDocument.mockImplementationOnce(async () => {
      useDocumentStore.getState().updateNodeText('node-2', '保存期间的新编辑')
    })
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    const saved = await useDocumentStore.getState().saveDoc()

    expect(saved).toBe(true)
    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('保存期间的新编辑')
    expect(useDocumentStore.getState().isDirty).toBe(true)
  })
})
