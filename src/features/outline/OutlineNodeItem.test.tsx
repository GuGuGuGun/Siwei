import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from '../../test/fixtures'
import { createDocumentSnapshotKey } from '../agent/agentChangePlan'
import { useAgentStore } from '../agent/agentStore'
import { useDocumentStore } from '../document/documentStore'
import { OutlineEditor } from './OutlineEditor'
import { OutlineNodeItem } from './OutlineNodeItem'

describe('OutlineNodeItem', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      currentDoc: createDocument(),
      viewMode: 'outline',
      selectedNodeId: 'node-2',
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
    useAgentStore.setState({
      pendingPlan: null,
      error: null,
      messages: [],
      isSending: false,
    })
  })

  it('keeps the note editor popover outside the clipped action toolbar', () => {
    const node = createDocument().root.children[1]

    render(
      <OutlineNodeItem
        node={node}
        depth={0}
        path={[1]}
        parentId="root"
        isSelected
        isCollapsed={false}
        onNavigate={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTitle('添加备注'))

    const textarea = screen.getByPlaceholderText('记录补充说明')
    const toolbar = textarea.closest('[data-node-actions]')

    expect(toolbar).toBeInTheDocument()
    expect(toolbar).not.toHaveClass('overflow-hidden')
  })

  it('opens the shared node context menu from an outline node', () => {
    render(<OutlineEditor />)

    fireEvent.contextMenu(screen.getByText('第一节点').closest('[data-node-id="node-1"]')!)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '新增同级节点' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: '删除节点' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: '向内缩进' })).toBeDisabled()
  })

  it('inserts a sibling from the outline node context menu and starts editing it', () => {
    render(<OutlineEditor />)

    fireEvent.contextMenu(screen.getByText('第一节点').closest('[data-node-id="node-1"]')!)
    fireEvent.click(screen.getByRole('menuitem', { name: '新增同级节点' }))

    const children = useDocumentStore.getState().currentDoc?.root.children ?? []
    expect(children.map((node) => node.text)).toEqual(['第一节点', '', '第二节点'])
    expect(screen.getByDisplayValue('')).toBeInTheDocument()
  })

  it('confirms before deleting an outline node with children from the context menu', () => {
    render(<OutlineEditor />)

    fireEvent.contextMenu(screen.getByText('第一节点').closest('[data-node-id="node-1"]')!)
    fireEvent.click(screen.getByRole('menuitem', { name: '删除节点' }))

    const dialog = screen.getByRole('dialog', { name: '删除节点' })
    expect(within(dialog).getByText('确定删除「第一节点」及其 1 个子节点吗？')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual(['node-2'])
  })

  it('shows assistant changes directly inside outline nodes', () => {
    const doc = useDocumentStore.getState().currentDoc!
    act(() => {
      useAgentStore.getState().setPendingPlan({
        schemaVersion: 1,
        contextScope: 'currentDocument',
        documentId: doc.id,
        snapshotKey: createDocumentSnapshotKey(doc),
        summary: '插入节点',
        rationale: '测试预览',
        riskLevel: 'low',
        references: [],
        operations: [
          {
            type: 'updateNode',
            nodeId: 'node-2',
            text: '助理改写',
          },
          {
            type: 'insertNode',
            parentNodeId: 'node-1',
            index: 1,
            node: { id: 'agent-node', text: '新增节点' },
          },
        ],
      })
    })

    render(<OutlineEditor />)

    expect(screen.getByText('助理改写')).toBeInTheDocument()
    expect(screen.getByText('新增节点')).toBeInTheDocument()
    expect(screen.getByText('将插入')).toBeInTheDocument()
  })

  it('shows root insertion previews when the outline is otherwise empty', () => {
    const doc = createDocument()
    const emptyDoc = {
      ...doc,
      root: {
        ...doc.root,
        children: [],
      },
    }
    useDocumentStore.setState({ currentDoc: emptyDoc })
    act(() => {
      useAgentStore.getState().setPendingPlan({
        schemaVersion: 1,
        contextScope: 'currentDocument',
        documentId: emptyDoc.id,
        snapshotKey: createDocumentSnapshotKey(emptyDoc),
        summary: '根节点插入',
        rationale: '测试预览',
        riskLevel: 'low',
        references: [],
        operations: [
          {
            type: 'insertNode',
            parentNodeId: emptyDoc.root.id,
            index: 0,
            node: { id: 'agent-node', text: '计算器开发' },
          },
        ],
      })
    })

    render(<OutlineEditor />)

    expect(screen.getByText('计算器开发')).toBeInTheDocument()
    expect(screen.getByText('将插入')).toBeInTheDocument()
    expect(screen.queryByText('点击缝入第一个节点')).not.toBeInTheDocument()
  })
})
