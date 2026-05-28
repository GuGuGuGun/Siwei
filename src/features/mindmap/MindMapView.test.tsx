import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '../../test/fixtures'
import { useDocumentStore } from '../document/documentStore'
import { MindMapView } from './MindMapView'

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
      onPaneClick,
      onKeyDown,
      children,
      nodesDraggable,
    }: MockReactFlowProps) => (
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
                onNodeDrag?.(event, node)
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
    ),
    Handle: () => <span data-testid="flow-handle" />,
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
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: [],
      cleanSnapshotKey: null,
      activeTextEditSession: null,
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

  it('commits node position changes in layout mode', () => {
    render(<MindMapView />)

    fireEvent.dragEnd(screen.getByTestId('flow-node-node-2'))

    expect(useDocumentStore.getState().currentDoc?.mindMapLayout?.['node-2']).toEqual({ x: 333, y: 222 })
    expect(useDocumentStore.getState().isDirty).toBe(true)
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

})
