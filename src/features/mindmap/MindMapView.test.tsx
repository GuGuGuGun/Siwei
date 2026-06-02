import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '../../test/fixtures'
import { createDocumentSnapshotKey } from '../agent/agentChangePlan'
import { useAgentStore } from '../agent/agentStore'
import type { AgentChangePlan, AgentOperation } from '../agent/agentTypes'
import { useDocumentStore } from '../document/documentStore'
import { useSettingsStore } from '../settings/settingsStore'
import { MindMapView } from './MindMapView'
import { DEFAULT_SETTINGS } from '../../types/settings'

vi.mock('reactflow', async () => {
  const React = await import('react')

  interface MockFlowNode {
    id: string
    type: string
    data: unknown
    selected?: boolean
    position?: { x: number; y: number }
    width?: number
    height?: number
  }

  interface MockReactFlowProps {
    nodes: MockFlowNode[]
    nodeTypes: Record<string, React.ComponentType<{ id: string; data: unknown; selected?: boolean; type: string }>>
    nodesDraggable?: boolean
    onNodeClick?: (event: React.MouseEvent, node: MockFlowNode) => void
    onNodeDoubleClick?: (event: React.MouseEvent, node: MockFlowNode) => void
    onNodeContextMenu?: (event: React.MouseEvent, node: MockFlowNode) => void
    onNodeDragStop?: (event: React.MouseEvent, node: MockFlowNode, nodes: MockFlowNode[]) => void
    onNodeDrag?: (event: React.MouseEvent, node: MockFlowNode) => void
    onNodeDragStart?: (event: React.MouseEvent, node: MockFlowNode) => void
    onInit?: (instance: { setCenter: ReturnType<typeof vi.fn> }) => void
    onPaneClick?: () => void
    onKeyDown?: (event: React.KeyboardEvent) => void
    children?: React.ReactNode
  }

  return {
    __esModule: true,
    default: ({
      nodes,
      nodeTypes,
      onNodeClick,
      onNodeDoubleClick,
      onNodeContextMenu,
      onNodeDrag,
      onNodeDragStart,
      onNodeDragStop,
      onInit,
      onPaneClick,
      onKeyDown,
      children,
      nodesDraggable,
    }: MockReactFlowProps) => {
      React.useEffect(() => {
        onInit?.({ setCenter: vi.fn() })
      }, [onInit])

      return (
        <div
          data-testid="react-flow"
          data-nodes-draggable={String(nodesDraggable)}
          tabIndex={0}
          onClick={onPaneClick}
          onKeyDown={onKeyDown}
        >
          {nodes.map((node) => {
            const NodeComponent = nodeTypes[node.type]
            return (
              <div
                key={node.id}
                data-testid={`flow-node-${node.id}`}
                data-position-x={node.position?.x}
                data-position-y={node.position?.y}
                data-width={node.width}
                data-height={node.height}
                onClick={(event) => {
                  event.stopPropagation()
                  onNodeClick?.(event, node)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onNodeDoubleClick?.(event, node)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onNodeContextMenu?.(event, node)
                }}
                onDragStart={(event) => {
                  event.stopPropagation()
                  onNodeDragStart?.(event, node)
                }}
                onDrag={(event) => {
                  event.stopPropagation()
                  const targetNode = nodes.find((currentNode) => currentNode.id === 'node-1')
                  onNodeDrag?.(event, {
                    ...node,
                    position: targetNode?.position ?? node.position ?? { x: 0, y: 0 },
                    width: 200,
                    height: 44,
                  })
                }}
                onDragEnd={(event) => {
                  event.stopPropagation()
                  const isReorganizeMode = document
                    .querySelector('[aria-label="重组"]')
                    ?.className.includes('bg-emerald-100') ?? false
                  const targetNode = nodes.find((currentNode) => currentNode.id === 'node-1')
                  const draggedPosition = isReorganizeMode && targetNode
                    ? targetNode.position ?? { x: 0, y: 0 }
                    : { x: 333, y: 222 }
                  const measuredNodes = nodes.map((currentNode) => ({
                    ...currentNode,
                    width: 200,
                    height: 44,
                  }))
                  onNodeDragStop?.(event, {
                    ...node,
                    position: draggedPosition,
                    width: 200,
                    height: 44,
                  }, measuredNodes)
                }}
                draggable
              >
                <NodeComponent id={node.id} data={node.data} selected={node.selected} type={node.type} />
              </div>
            )
          })}
          {children}
        </div>
      )
    },
    Handle: ({ id, onClick }: { id?: string; onClick?: React.MouseEventHandler }) => (
      <span data-testid={`flow-handle-${id}`} onClick={onClick} />
    ),
    Position: { Left: 'left', Right: 'right' },
    MiniMap: () => <div data-testid="flow-minimap" />,
    Controls: () => <div data-testid="flow-controls" />,
    Background: () => <div data-testid="flow-background" />,
    useNodesState: (initial: MockFlowNode[]) => {
      const [nodes, setNodes] = React.useState(initial)
      return [nodes, setNodes, vi.fn()]
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial)
      return [edges, setEdges, vi.fn()]
    },
  }
})

describe('MindMapView', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      currentDoc: createDocument(),
      viewMode: 'mindmap',
      selectedNodeId: null,
      collapsedNodeIds: new Set<string>(),
      isDirty: false,
      saveStatus: 'idle',
      currentFilePath: null,
      filter: { query: '', tag: null, checked: 'all' },
      focusedNodeId: null,
      focusRequestSeq: 0,
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
      outlineSelection: { anchorNodeId: null, selectedNodeIds: [] },
    })
    useAgentStore.setState({
      pendingPlan: null,
      error: null,
      messages: [],
      isSending: false,
    })
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      isLoaded: false,
      isSaving: false,
      error: null,
    })
  })

  it('opens a context menu with root-only disabled operations', () => {
    render(<MindMapView />)

    fireEvent.contextMenu(screen.getByTestId('flow-node-root'))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '新增同级节点' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '删除节点' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '新增子节点' })).toBeEnabled()
  })

  it('renames a node from double click inline editing', () => {
    render(<MindMapView />)

    fireEvent.doubleClick(screen.getByTestId('flow-node-node-2'))
    const input = screen.getByDisplayValue('第二节点')
    fireEvent.change(input, { target: { value: '导图重命名' } })
    fireEvent.blur(input)

    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('导图重命名')
    expect(screen.queryByDisplayValue('导图重命名')).not.toBeInTheDocument()
  })

  it('renders inline content in non-editing mind map nodes', () => {
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          root: {
            ...state.currentDoc.root,
            children: [
              {
                ...state.currentDoc.root.children[0],
                text: '**粗体** *斜体* `code` $x^2$',
              },
            ],
          },
        }
        : state.currentDoc,
    }))

    render(<MindMapView />)

    const node = screen.getByTestId('mindmap-node-node-1')
    expect(within(node).getByText('粗体').tagName).toBe('STRONG')
    expect(within(node).getByText('斜体').tagName).toBe('EM')
    expect(within(node).getByText('code').tagName).toBe('CODE')
    expect(within(node).getByText('x^2')).toHaveAttribute('data-inline-latex')
    expect(node).not.toHaveTextContent('**粗体**')
  })

  it('confirms before deleting a node with children', () => {
    render(<MindMapView />)

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除节点' }))

    const dialog = screen.getByRole('dialog', { name: '删除节点' })
    expect(within(dialog).getByText('确定删除「第一节点」及其 1 个子节点吗？')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual(['node-2'])
  })

  it('does not run structural shortcuts while composing text input', () => {
    render(<MindMapView />)

    fireEvent.doubleClick(screen.getByTestId('flow-node-node-2'))
    const input = screen.getByDisplayValue('第二节点')
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
    ])
  })

  it('keeps IME draft text local while composing in inline editing', () => {
    render(<MindMapView />)

    fireEvent.doubleClick(screen.getByTestId('flow-node-node-2'))
    const input = screen.getByDisplayValue('第二节点')

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'nihao' } })

    expect(input).toHaveValue('nihao')
    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('第二节点')
    expect(useDocumentStore.getState().activeTextEditSession?.didChange).toBe(false)

    fireEvent.compositionEnd(input, { data: '你好' })
    fireEvent.change(input, { target: { value: '你好' } })
    fireEvent.blur(input)

    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('你好')
    expect(useDocumentStore.getState().canUndo).toBe(true)
  })

  it('commits IME text from composition end when no extra change event follows', () => {
    render(<MindMapView />)

    fireEvent.doubleClick(screen.getByTestId('flow-node-node-2'))
    const input = screen.getByDisplayValue('第二节点')

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'nihao' } })
    fireEvent.compositionEnd(input, { data: '你好', target: { value: '你好' } })
    fireEvent.blur(input)

    expect(useDocumentStore.getState().currentDoc?.root.children[1].text).toBe('你好')
    expect(screen.queryByDisplayValue('空白节点')).not.toBeInTheDocument()
  })

  it('commits node position changes in layout mode without locking descendants', () => {
    render(<MindMapView />)

    fireEvent.dragEnd(screen.getByTestId('flow-node-node-2'))

    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-2']).toMatchObject({
      position: { x: 333, y: 222 },
      source: 'manual',
      locked: true,
    })
    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-1-1']).toMatchObject({
      locked: false,
    })
    expect(useDocumentStore.getState().isDirty).toBe(true)
    expect(screen.getByText('布局已更新')).toBeInTheDocument()
  })

  it('switches to reorganize mode and keeps the ReactFlow drag channel enabled', async () => {
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '重组' }))
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes-draggable', 'true')
    await waitFor(() => expect(screen.getByTestId('mindmap-node-node-2')).not.toHaveAttribute('draggable'))
  })

  it('uses ReactFlow dragging in reorganize mode to move nodes', async () => {
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '重组' }))
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes-draggable', 'true')
    fireEvent.dragEnd(screen.getByTestId('flow-node-node-2'))

    expect(useDocumentStore.getState().currentDoc?.root.children.map((node) => node.id)).toEqual(['node-1'])
    expect(useDocumentStore.getState().currentDoc?.root.children[0].children.map((node) => node.id)).toEqual([
      'node-1-1',
      'node-2',
    ])
    expect(useDocumentStore.getState().currentDoc?.mindMapLayout).toBeUndefined()
  })

  it('keeps the dragged node position while updating the reorganize drop preview', async () => {
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          mindMapLayout: {
            engineVersion: 1,
            strategy: 'classic-dagre',
            nodes: {
              root: { position: { x: 0, y: 0 }, source: 'manual', locked: true },
              'node-1': { position: { x: 300, y: 100 }, source: 'manual', locked: true },
              'node-1-1': { position: { x: 600, y: 100 }, source: 'manual', locked: true },
              'node-2': { position: { x: 900, y: 300 }, source: 'manual', locked: true },
            },
          },
        }
        : state.currentDoc,
    }))
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '重组' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '重组' })).toHaveClass('bg-emerald-100'))
    const draggedNode = screen.getByTestId('flow-node-node-2')
    expect(draggedNode).toHaveAttribute('data-position-x', '900')

    fireEvent.drag(draggedNode)

    await waitFor(() => expect(screen.getByTestId('mindmap-node-node-1')).toHaveClass('ring-4'))
    expect(screen.getByTestId('flow-node-node-2')).toHaveAttribute('data-position-x', '300')
    expect(screen.getByTestId('flow-node-node-2')).toHaveAttribute('data-position-y', '100')
  })

  it('reserves child-column space while previewing a reorganize child drop', async () => {
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          mindMapLayout: {
            engineVersion: 1,
            strategy: 'classic-dagre',
            nodes: {
              root: { position: { x: 0, y: 0 }, source: 'manual', locked: true },
              'node-1': { position: { x: 100, y: 80 }, source: 'manual', locked: true },
              'node-1-1': { position: { x: 240, y: 96 }, source: 'manual', locked: true },
              'node-2': { position: { x: 500, y: 220 }, source: 'manual', locked: true },
            },
          },
        }
        : state.currentDoc,
    }))
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '重组' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '重组' })).toHaveClass('bg-emerald-100'))
    fireEvent.drag(screen.getByTestId('flow-node-node-2'))

    await waitFor(() => expect(screen.getByTestId('mindmap-node-node-1')).toHaveClass('ring-4'))
    expect(Number(screen.getByTestId('flow-node-node-1-1').dataset.positionX)).toBeGreaterThanOrEqual(340)

    fireEvent.dragEnd(screen.getByTestId('flow-node-node-2'))

    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-1-1'].position).toEqual({ x: 240, y: 96 })
  })

  it('renders assistant previews inside mind map nodes', () => {
    const doc = useDocumentStore.getState().currentDoc!
    act(() => {
      useAgentStore.getState().setPendingPlan({
        ...createStrictPlan(doc.id, createDocumentSnapshotKey(doc), [
          {
            type: 'updateNode',
            nodeId: 'node-2',
            text: '助理改写',
          },
          {
            type: 'deleteNode',
            nodeId: 'node-1-1',
          },
        ]),
      })
    })

    render(<MindMapView />)

    expect(screen.getByTestId('mindmap-node-node-2')).toHaveTextContent('助理改写')
    expect(screen.getByTestId('mindmap-node-node-1-1')).toHaveTextContent('将删除')
  })

  it('renders root insertion previews as mind map nodes when the document has no children', () => {
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
        ...createStrictPlan(emptyDoc.id, createDocumentSnapshotKey(emptyDoc), [
          {
            type: 'insertNode',
            parentNodeId: emptyDoc.root.id,
            index: 0,
            node: { id: 'agent-node', text: '计算器开发' },
          },
        ]),
      })
    })

    render(<MindMapView />)

    expect(screen.getByTestId('mindmap-node-agent-insertion-preview:agent-node')).toHaveTextContent('计算器开发')
    expect(screen.getByTestId('mindmap-node-agent-insertion-preview:agent-node')).toHaveTextContent('将插入')
  })

  it('renders nested assistant insertion preview nodes before confirmation', () => {
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
        ...createStrictPlan(emptyDoc.id, createDocumentSnapshotKey(emptyDoc), [
          {
            type: 'insertNode',
            parentNodeId: emptyDoc.root.id,
            index: 0,
            node: {
              id: 'agent-root',
              text: 'AI 生成导图',
              children: [
                {
                  id: 'agent-child',
                  text: '一级分支',
                  children: [
                    {
                      id: 'agent-grandchild',
                      text: '二级分支',
                    },
                  ],
                },
              ],
            },
          },
        ]),
      })
    })

    render(<MindMapView />)

    expect(screen.getByTestId('mindmap-node-agent-insertion-preview:agent-root')).toHaveTextContent('AI 生成导图')
    expect(screen.getByTestId('mindmap-node-agent-insertion-preview:agent-child')).toHaveTextContent('一级分支')
    expect(screen.getByTestId('mindmap-node-agent-insertion-preview:agent-grandchild')).toHaveTextContent('二级分支')
  })

  it('lays out nested assistant insertion previews with the balanced strategy before confirmation', () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
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
        ...createStrictPlan(emptyDoc.id, createDocumentSnapshotKey(emptyDoc), [
          {
            type: 'insertNode',
            parentNodeId: emptyDoc.root.id,
            index: 0,
            node: {
              id: 'agent-root',
              text: 'AI 生成导图',
              children: [
                {
                  id: 'agent-child',
                  text: '一级分支',
                },
              ],
            },
          },
        ]),
      })
    })

    render(<MindMapView />)
    fireEvent.change(screen.getByLabelText('导图布局策略'), { target: { value: 'balanced-mindmap' } })

    const previewRootX = Number(screen.getByTestId('flow-node-agent-insertion-preview:agent-root').dataset.positionX)
    const previewChildX = Number(screen.getByTestId('flow-node-agent-insertion-preview:agent-child').dataset.positionX)

    expect(previewRootX).toBeLessThan(0)
    expect(previewChildX).toBeLessThan(previewRootX)
  })

  it('shows radial strategy only when the experimental layout engine is enabled', () => {
    render(<MindMapView />)

    expect(screen.queryByLabelText('导图布局策略')).not.toBeInTheDocument()
    cleanup()

    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))

    render(<MindMapView />)

    expect(screen.getByRole('option', { name: '径向' })).toHaveValue('radial-mindmap')
  })

  it('saves radial layout state with engine version 3 from auto layout', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    render(<MindMapView />)

    fireEvent.change(screen.getByLabelText('导图布局策略'), { target: { value: 'radial-mindmap' } })
    fireEvent.click(screen.getByRole('button', { name: '自动整理' }))

    expect(useDocumentStore.getState().currentDoc?.mindMapLayout).toMatchObject({
      engineVersion: 3,
      strategy: 'radial-mindmap',
    })
    confirmSpy.mockRestore()
  })

  it('restores a saved radial strategy when the experimental layout engine is enabled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          mindMapLayout: {
            engineVersion: 2,
            strategy: 'radial-mindmap',
            nodes: {},
          },
        }
        : state.currentDoc,
    }))

    render(<MindMapView />)

    expect(screen.getByLabelText('导图布局策略')).toHaveValue('radial-mindmap')

    fireEvent.click(screen.getByRole('button', { name: '自动整理' }))

    expect(useDocumentStore.getState().currentDoc?.mindMapLayout).toMatchObject({
      engineVersion: 3,
      strategy: 'radial-mindmap',
    })
    confirmSpy.mockRestore()
  })

  it('keeps a manually selected strategy after restoring a saved radial strategy', () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          mindMapLayout: {
            engineVersion: 2,
            strategy: 'radial-mindmap',
            nodes: {},
          },
        }
        : state.currentDoc,
    }))

    render(<MindMapView />)

    const strategySelect = screen.getByLabelText('导图布局策略')
    expect(strategySelect).toHaveValue('radial-mindmap')

    fireEvent.change(strategySelect, { target: { value: 'balanced-mindmap' } })

    expect(strategySelect).toHaveValue('balanced-mindmap')
  })

  it('collapses and restores one branch side from the side handle in balanced layout', async () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          root: {
            ...state.currentDoc.root,
            children: [
              {
                id: 'topic',
                text: '中心主题',
                createdAt: 1,
                updatedAt: 1,
                children: [
                  { id: 'left-child', text: '左侧分支', createdAt: 1, updatedAt: 1, children: [] },
                  { id: 'right-child', text: '右侧分支', createdAt: 1, updatedAt: 1, children: [] },
                ],
              },
            ],
          },
        }
        : state.currentDoc,
    }))

    render(<MindMapView />)
    fireEvent.change(screen.getByLabelText('导图布局策略'), { target: { value: 'balanced-mindmap' } })

    expect(screen.getByTestId('flow-node-left-child')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-right-child')).toBeInTheDocument()

    fireEvent.click(within(screen.getByTestId('mindmap-node-topic')).getByTestId('flow-handle-left-source'))

    await waitFor(() => expect(screen.queryByTestId('flow-node-left-child')).not.toBeInTheDocument())
    expect(screen.getByTestId('flow-node-right-child')).toBeInTheDocument()

    fireEvent.click(within(screen.getByTestId('mindmap-node-topic')).getByTestId('flow-handle-left-source'))

    await waitFor(() => expect(screen.getByTestId('flow-node-left-child')).toBeInTheDocument())
  })

  it('keeps layout node sizes on rendered nodes after insertion', () => {
    const doc = createDocument()
    const insertedDoc = {
      ...doc,
      root: {
        ...doc.root,
        children: [
          {
            ...doc.root.children[0],
            id: 'inserted-node',
            text: '插入后真实节点',
            children: [],
          },
        ],
      },
    }
    useDocumentStore.setState({ currentDoc: insertedDoc })

    render(<MindMapView />)

    expect(screen.getByTestId('flow-node-inserted-node')).toHaveAttribute('data-position-x')
    expect(screen.getByTestId('flow-node-inserted-node')).toHaveAttribute('data-width')
    expect(screen.getByTestId('flow-node-inserted-node')).toHaveAttribute('data-height')
  })

  it('focuses a branch from the mind map context menu and returns to the full map', async () => {
    render(<MindMapView />)

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '聚焦此分支' }))

    await waitFor(() => expect(screen.queryByTestId('flow-node-root')).not.toBeInTheDocument())
    expect(screen.getByText('已聚焦当前分支：第一节点')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-node-1')).toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-node-2')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '回到全图' }))

    await waitFor(() => expect(screen.getByTestId('flow-node-root')).toBeInTheDocument())
    expect(screen.getByTestId('flow-node-node-2')).toBeInTheDocument()
  })

  it('exits branch focus when an external node focus request arrives', async () => {
    render(<MindMapView />)

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '聚焦此分支' }))
    await waitFor(() => expect(screen.queryByTestId('flow-node-node-2')).not.toBeInTheDocument())

    act(() => {
      useDocumentStore.getState().focusNode('node-2')
    })

    await waitFor(() => expect(screen.getByTestId('flow-node-node-2')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '回到全图' })).not.toBeInTheDocument()
  })

  it('returns to the parent branch after deleting the focused branch root', async () => {
    render(<MindMapView />)

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '聚焦此分支' }))
    await waitFor(() => expect(screen.queryByTestId('flow-node-node-1')).not.toBeInTheDocument())

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除节点' }))

    await waitFor(() => expect(screen.getByTestId('flow-node-node-1')).toBeInTheDocument())
    expect(screen.queryByTestId('flow-node-root')).not.toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-node-2')).not.toBeInTheDocument()
  })

  it('searches visible mind map nodes and highlights the active match', async () => {
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '搜索导图' }))
    fireEvent.change(screen.getByLabelText('导图搜索关键词'), { target: { value: '第二' } })

    await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument())
    expect(screen.getByTestId('mindmap-node-node-2')).toHaveClass('ring-4')
    expect(useDocumentStore.getState().selectedNodeId).toBe('node-2')
  })

  it('confirms before auto layout overwrites a manual layout', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          mindMapLayout: {
            engineVersion: 1,
            strategy: 'classic-dagre',
            nodes: {
              root: { position: { x: 0, y: 0 }, source: 'manual', locked: true },
              'node-1': { position: { x: 10, y: 20 }, source: 'manual', locked: true },
            },
          },
        }
        : state.currentDoc,
    }))
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '自动整理' }))

    expect(confirmSpy).toHaveBeenCalledWith('自动布局会覆盖当前手动布局，是否继续？')
    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-1'].position).toEqual({ x: 10, y: 20 })
    confirmSpy.mockRestore()
  })

  it('keeps mind map export out of the local canvas toolbar', () => {
    render(<MindMapView />)

    expect(screen.queryByRole('button', { name: '导出导图' })).not.toBeInTheDocument()
  })

  it('shows free-canvas, force preview, and diagnostics only when experiments are enabled', () => {
    render(<MindMapView />)

    expect(screen.queryByRole('option', { name: '自由画布' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '力导向预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '布局诊断' })).not.toBeInTheDocument()
    cleanup()

    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))

    render(<MindMapView />)

    expect(screen.getByRole('option', { name: '自由画布' })).toHaveValue('free-canvas')
    expect(screen.getByRole('button', { name: '力导向预览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '布局诊断' })).toBeInTheDocument()
  })

  it('cancels force-directed preview without persisting and applies only when requested', async () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    render(<MindMapView />)
    fireEvent.change(screen.getByLabelText('导图布局策略'), { target: { value: 'free-canvas' } })

    const beforeLayout = useDocumentStore.getState().currentDoc?.mindMapLayout
    fireEvent.click(screen.getByRole('button', { name: '力导向预览' }))

    expect(screen.getByRole('button', { name: '应用力导向布局' })).toBeInTheDocument()
    expect(useDocumentStore.getState().currentDoc?.mindMapLayout).toBe(beforeLayout)

    fireEvent.click(screen.getByRole('button', { name: '取消力导向预览' }))
    expect(screen.queryByRole('button', { name: '应用力导向布局' })).not.toBeInTheDocument()
    expect(useDocumentStore.getState().currentDoc?.mindMapLayout).toBe(beforeLayout)

    fireEvent.click(screen.getByRole('button', { name: '力导向预览' }))
    fireEvent.click(screen.getByRole('button', { name: '应用力导向布局' }))

    await waitFor(() => expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-2'].source).toBe('force-applied'))
  })

  it('freezes drag and structural context actions during force-directed preview', () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    render(<MindMapView />)

    fireEvent.click(screen.getByRole('button', { name: '力导向预览' }))

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes-draggable', 'false')
    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1'))
    expect(screen.queryByRole('menuitem', { name: '重排当前分支' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '解锁当前节点' })).not.toBeInTheDocument()
  })

  it('relayouts a branch and unlocks a node from experimental mind map menu', async () => {
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        experimentalMindMapLayoutEngine: true,
      },
    }))
    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc
        ? {
          ...state.currentDoc,
          mindMapLayout: {
            engineVersion: 3,
            strategy: 'free-canvas',
            nodes: {
              root: { position: { x: 0, y: 0 }, source: 'manual', locked: true },
              'node-1': { position: { x: 100, y: 100 }, source: 'manual', locked: true },
              'node-1-1': { position: { x: 900, y: 900 }, source: 'manual', locked: false },
              'node-2': { position: { x: 300, y: 100 }, source: 'manual', locked: true },
            },
          },
        }
        : state.currentDoc,
    }))
    render(<MindMapView />)

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '重排当前分支' }))

    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-1-1'].source).toBe('incremental')
    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-1-1'].position).not.toEqual({ x: 900, y: 900 })

    fireEvent.contextMenu(screen.getByTestId('flow-node-node-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: '解锁当前节点' }))

    await waitFor(() => expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.nodes['node-1'].locked).toBe(false))
  })

})

function createStrictPlan(
  documentId: string,
  snapshotKey: string,
  operations: AgentOperation[],
): AgentChangePlan {
  return {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId,
    snapshotKey,
    summary: '测试修改计划',
    rationale: '验证脑图中的助理预览',
    riskLevel: 'low',
    references: [],
    operations,
  }
}
