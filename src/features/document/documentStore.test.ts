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
  refreshLibraryDoc: vi.fn(),
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
      filter: { query: '', tag: null, checked: 'all' },
      focusedNodeId: null,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
    })
    apiMock.refreshLibraryDoc.mockResolvedValue({
      documentId: 'doc-1',
      title: '测试文档',
      path: 'demo.siwei.json',
      updatedAt: 1,
      indexedAt: 1,
      nodeCount: 2,
      taskCount: 0,
      uncheckedTaskCount: 0,
      tags: [],
      status: 'ready',
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
    expect(apiMock.refreshLibraryDoc).toHaveBeenCalledWith('demo.siwei.json')
  })

  it('keeps save successful when library index refresh fails', async () => {
    useDocumentStore.setState({
      currentDoc: createDocument(),
      currentFilePath: 'demo.siwei.json',
      isDirty: true,
    })
    apiMock.saveDocument.mockResolvedValueOnce(undefined)
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)
    apiMock.refreshLibraryDoc.mockRejectedValueOnce(new Error('索引刷新失败'))

    const saved = await useDocumentStore.getState().saveDoc()

    expect(saved).toBe(true)
    expect(useDocumentStore.getState().saveStatus).toBe('saved')
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
    expect(useDocumentStore.getState().currentDoc?.root.children[1].checked).toBe(false)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].checked).toBeUndefined()

    useDocumentStore.getState().toggleCollapse('node-1')
    expect(useDocumentStore.getState().collapsedNodeIds.has('node-1')).toBe(true)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().collapsedNodeIds.has('node-1')).toBe(false)
  })

  it('moves a dragged node before a same-level sibling and records undo history', async () => {
    await loadFixtureDoc()

    useDocumentStore.getState().moveNodeToSibling('node-2', 'node-1')

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-2',
      'node-1',
    ])
    expect(useDocumentStore.getState().selectedNodeId).toBe('node-2')
    expect(useDocumentStore.getState().canUndo).toBe(true)

    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
    ])
  })

  it('ignores drag moves across different levels', async () => {
    await loadFixtureDoc()

    useDocumentStore.getState().moveNodeToSibling('node-1-1', 'node-2')

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
    ])
    expect(useDocumentStore.getState().currentDoc?.root.children[0].children.map((node) => node.id)).toEqual([
      'node-1-1',
    ])
    expect(useDocumentStore.getState().canUndo).toBe(false)
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

  it('updates note task and tags through history-aware node property actions', async () => {
    await loadFixtureDoc()

    useDocumentStore.getState().updateNodeNote('node-2', '  多行备注\n第二行  ')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].note).toBe('多行备注\n第二行')
    expect(useDocumentStore.getState().isDirty).toBe(true)

    useDocumentStore.getState().setNodeChecked('node-2', false)
    expect(useDocumentStore.getState().currentDoc?.root.children[1].checked).toBe(false)

    useDocumentStore.getState().toggleNodeChecked('node-2')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].checked).toBe(true)

    useDocumentStore.getState().setNodeTags('node-2', [' 工作 ', '', '重要', '工作'])
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toEqual(['工作', '重要'])

    useDocumentStore.getState().addNodeTag('node-2', '新增')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toEqual(['工作', '重要', '新增'])

    useDocumentStore.getState().removeNodeTag('node-2', '重要')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toEqual(['工作', '新增'])

    useDocumentStore.getState().clearNodeNote('node-2')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].note).toBeUndefined()

    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].note).toBe('多行备注\n第二行')
    useDocumentStore.getState().redo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].note).toBeUndefined()
  })

  it('renames removes and merges tags with history and dirty state', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await loadFixtureDoc({
      ...createDocument(),
      root: {
        ...createDocument().root,
        children: [
          {
            ...createDocument().root.children[0],
            tags: ['工作', '重要'],
            children: [
              {
                ...createDocument().root.children[0].children[0],
                tags: ['工作'],
              },
            ],
          },
          {
            ...createDocument().root.children[1],
            tags: ['生活', '工作'],
          },
        ],
      },
    })

    useDocumentStore.getState().setFilterTag('工作')
    useDocumentStore.getState().renameTag('工作', '项目')
    expect(useDocumentStore.getState().currentDoc?.root.children[0].tags).toEqual(['项目', '重要'])
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toEqual(['生活', '项目'])
    expect(useDocumentStore.getState().filter.tag).toBe('项目')
    expect(useDocumentStore.getState().isDirty).toBe(true)
    expect(useDocumentStore.getState().canUndo).toBe(true)

    useDocumentStore.getState().removeTagFromDocument('重要')
    expect(confirmSpy).toHaveBeenLastCalledWith('确定从 1 个节点中删除标签「重要」吗？')
    expect(useDocumentStore.getState().currentDoc?.root.children[0].tags).toEqual(['项目'])

    useDocumentStore.getState().mergeTag('生活', '项目')
    expect(confirmSpy).toHaveBeenLastCalledWith('确定将 1 个节点中的「生活」合并为「项目」吗？')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toEqual(['项目'])

    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toEqual(['生活', '项目'])

    confirmSpy.mockRestore()
  })

  it('focuses a node by expanding ancestors, selecting it, and clearing transient highlight', async () => {
    await loadFixtureDoc()
    useDocumentStore.setState({ collapsedNodeIds: new Set(['node-1']) })

    useDocumentStore.getState().focusNode('node-1-1')

    expect(useDocumentStore.getState().collapsedNodeIds.has('node-1')).toBe(false)
    expect(useDocumentStore.getState().selectedNodeId).toBe('node-1-1')
    expect(useDocumentStore.getState().focusedNodeId).toBe('node-1-1')

    vi.advanceTimersByTime(1600)
    expect(useDocumentStore.getState().focusedNodeId).toBeNull()
  })

  it('restores clean state when undoing property edits back to the save point', async () => {
    await loadFixtureDoc()
    apiMock.saveDocument.mockResolvedValueOnce(undefined)
    apiMock.addRecentDoc.mockResolvedValueOnce(undefined)

    await useDocumentStore.getState().saveDoc()
    expect(useDocumentStore.getState().isDirty).toBe(false)

    useDocumentStore.getState().addNodeTag('node-2', '工作')
    expect(useDocumentStore.getState().isDirty).toBe(true)

    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().currentDoc?.root.children[1].tags).toBeUndefined()
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
