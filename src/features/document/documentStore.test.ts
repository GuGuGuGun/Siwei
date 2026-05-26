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
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
    })
  })

  async function loadFixtureDoc(doc = createDocument()) {
    apiMock.loadDocument.mockResolvedValueOnce(doc)
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    await useDocumentStore.getState().loadDoc('demo.siwei.json')
  }

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

  it('undoes and redoes insert, delete, indent, move, check, and collapse edits', async () => {
    await loadFixtureDoc()

    const insertedId = useDocumentStore.getState().insertNode('node-2', '新增节点')
    expect(insertedId).toBeTruthy()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.text)).toEqual([
      '第一节点',
      '第二节点',
      '新增节点',
    ])

    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.text)).toEqual([
      '第一节点',
      '第二节点',
    ])
    expect(useDocumentStore.getState().canRedo).toBe(true)

    useDocumentStore.getState().redo()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.text)).toEqual([
      '第一节点',
      '第二节点',
      '新增节点',
    ])

    useDocumentStore.getState().deleteNode(insertedId!)
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.text)).toEqual([
      '第一节点',
      '第二节点',
    ])
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.text)).toEqual([
      '第一节点',
      '第二节点',
      '新增节点',
    ])

    useDocumentStore.getState().indentNode('node-2')
    expect(useDocumentStore.getState().currentDoc?.root.children[0].children.map((node) => node.id)).toEqual([
      'node-1-1',
      'node-2',
    ])
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
      insertedId,
    ])

    useDocumentStore.getState().moveNode('node-2', 'up')
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-2',
      'node-1',
      insertedId,
    ])
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
      insertedId,
    ])

    useDocumentStore.getState().toggleNodeCheck('node-2')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].checked).toBe(true)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].checked).toBeUndefined()

    useDocumentStore.getState().toggleCollapse('node-1')
    expect(useDocumentStore.getState().collapsedNodeIds.has('node-1')).toBe(true)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().collapsedNodeIds.has('node-1')).toBe(false)
  })

  it('merges repeated text changes in one focus session into one undo record', async () => {
    await loadFixtureDoc()

    useDocumentStore.getState().beginTextEditSession('node-2')
    useDocumentStore.getState().updateNodeText('node-2', '第一版')
    useDocumentStore.getState().updateNodeText('node-2', '第二版')
    useDocumentStore.getState().commitTextEditSession('node-2')

    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('第二版')
    expect(useDocumentStore.getState().canUndo).toBe(true)

    useDocumentStore.getState().undo()

    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('第二节点')
    expect(useDocumentStore.getState().canUndo).toBe(false)
    expect(useDocumentStore.getState().canRedo).toBe(true)
  })

  it('clears history after new, load, and import lifecycle actions', async () => {
    await loadFixtureDoc()
    useDocumentStore.getState().insertNode('node-2')
    expect(useDocumentStore.getState().canUndo).toBe(true)

    apiMock.newDocument.mockResolvedValueOnce(createDocument())
    await useDocumentStore.getState().newDoc()
    expect(useDocumentStore.getState().canUndo).toBe(false)
    expect(useDocumentStore.getState().canRedo).toBe(false)

    useDocumentStore.getState().insertNode('node-2')
    expect(useDocumentStore.getState().canUndo).toBe(true)

    await loadFixtureDoc()
    expect(useDocumentStore.getState().canUndo).toBe(false)
    expect(useDocumentStore.getState().canRedo).toBe(false)

    useDocumentStore.getState().insertNode('node-2')
    expect(useDocumentStore.getState().canUndo).toBe(true)

    apiMock.importJson.mockResolvedValueOnce(createDocument())
    await useDocumentStore.getState().importDoc('import.siwei.json', 'json')
    expect(useDocumentStore.getState().canUndo).toBe(false)
    expect(useDocumentStore.getState().canRedo).toBe(false)
    expect(useDocumentStore.getState().isDirty).toBe(true)
  })

  it('marks the document clean when undo returns to the save point', async () => {
    await loadFixtureDoc()
    useDocumentStore.getState().updateNodeText('node-2', '保存点文本')
    apiMock.saveDocument.mockResolvedValueOnce(undefined)
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    await useDocumentStore.getState().saveDoc()
    expect(useDocumentStore.getState().isDirty).toBe(false)

    useDocumentStore.getState().updateNodeText('node-2', '保存后的编辑')
    expect(useDocumentStore.getState().isDirty).toBe(true)

    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('保存点文本')
    expect(useDocumentStore.getState().isDirty).toBe(false)
  })

  it('keeps state unchanged when undo or redo has no history', async () => {
    await loadFixtureDoc()
    const initialDoc = useDocumentStore.getState().currentDoc

    useDocumentStore.getState().undo()
    useDocumentStore.getState().redo()

    expect(useDocumentStore.getState().currentDoc).toBe(initialDoc)
    expect(useDocumentStore.getState().canUndo).toBe(false)
    expect(useDocumentStore.getState().canRedo).toBe(false)
  })
})
