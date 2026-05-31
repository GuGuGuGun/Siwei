import { describe, expect, it } from 'vitest'
import { createNode } from '../../test/fixtures'
import { outlineToGraph } from './outlineToGraph'
import { estimateMindMapNodeSize, layoutMindMap } from './layoutEngine'
import type { MindMapLayoutState } from '../../types/document'

describe('layoutMindMap', () => {
  const root = createNode('root', 'Root', [
    createNode('a', 'A', [
      createNode('a-1', 'A1'),
      createNode('a-2', 'A2'),
    ]),
    createNode('b', 'B'),
    createNode('c', 'C', [
      createNode('c-1', 'C1'),
    ]),
  ])

  it('adapts classic dagre and returns persistent layout state', () => {
    const graphData = outlineToGraph(root, new Set())

    const result = layoutMindMap({
      root,
      graphData,
      collapsedNodeIds: new Set(),
      strategy: 'classic-dagre',
      nodeSizes: {},
      mode: 'persistent',
    })

    expect(result.nodes).toHaveLength(graphData.nodes.length)
    expect(result.layoutState).toMatchObject({
      engineVersion: 2,
      strategy: 'classic-dagre',
    })
    expect(result.layoutState?.nodes.root.position).toEqual(result.nodes.find((node) => node.id === 'root')?.position)
  })

  it('balances first-level branches across both sides deterministically', () => {
    const graphData = outlineToGraph(root, new Set())
    const input = {
      root,
      graphData,
      collapsedNodeIds: new Set<string>(),
      strategy: 'balanced-mindmap' as const,
      nodeSizes: {},
      mode: 'persistent' as const,
    }

    const first = layoutMindMap(input)
    const second = layoutMindMap(input)
    const positionById = Object.fromEntries(first.nodes.map((node) => [node.id, node.position]))

    expect(positionById.root.x).toBeLessThanOrEqual(0)
    expect(positionById.a.x).toBeLessThan(0)
    expect(positionById.b.x).toBeGreaterThan(0)
    expect(first.nodes.map((node) => [node.id, node.position])).toEqual(
      second.nodes.map((node) => [node.id, node.position]),
    )
    expect(first.layoutState?.strategy).toBe('balanced-mindmap')
  })

  it('uses the only top-level topic as the visual center in balanced layout', () => {
    const singleTopicRoot = createNode('root', 'Document', [
      createNode('topic', '408 数据结构', [
        createNode('linear-list', '线性表'),
        createNode('stack-queue', '栈和队列'),
        createNode('tree', '树'),
      ]),
    ])

    const result = layoutMindMap({
      root: singleTopicRoot,
      graphData: outlineToGraph(singleTopicRoot, new Set()),
      collapsedNodeIds: new Set(),
      strategy: 'balanced-mindmap',
      nodeSizes: {},
      mode: 'persistent',
    })
    const positionById = Object.fromEntries(result.nodes.map((node) => [node.id, node.position]))

    expect(Math.abs(positionById.topic.x)).toBeLessThan(Math.abs(positionById.root.x))
    expect(positionById.root.x).toBeGreaterThan(positionById.topic.x)
    expect(positionById['linear-list'].x).toBeLessThan(positionById.topic.x)
    expect(positionById['stack-queue'].x).toBeGreaterThan(positionById.root.x)
  })

  it('anchors balanced layout edges to the side where the child branch is placed', () => {
    const singleTopicRoot = createNode('root', 'Document', [
      createNode('topic', '408 数据结构', [
        createNode('linear-list', '线性表'),
        createNode('stack-queue', '栈和队列'),
      ]),
    ])

    const result = layoutMindMap({
      root: singleTopicRoot,
      graphData: outlineToGraph(singleTopicRoot, new Set()),
      collapsedNodeIds: new Set(),
      strategy: 'balanced-mindmap',
      nodeSizes: {},
      mode: 'persistent',
    })
    const edgeById = Object.fromEntries(result.edges.map((edge) => [edge.id, edge]))

    expect(edgeById['topic-linear-list']).toMatchObject({
      sourceHandle: 'left-source',
      targetHandle: 'right-target',
    })
    expect(edgeById['topic-stack-queue']).toMatchObject({
      sourceHandle: 'right-source',
      targetHandle: 'left-target',
    })
  })

  it('preserves locked node positions from persisted layout', () => {
    const graphData = outlineToGraph(root, new Set())
    const persistedLayout: MindMapLayoutState = {
      engineVersion: 1,
      strategy: 'balanced-mindmap',
      nodes: {
        a: {
          position: { x: 999, y: 888 },
          source: 'manual',
          locked: true,
          updatedAt: 10,
        },
      },
    }

    const result = layoutMindMap({
      root,
      graphData,
      collapsedNodeIds: new Set(),
      strategy: 'balanced-mindmap',
      persistedLayout,
      nodeSizes: {},
      mode: 'persistent',
    })

    expect(result.nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 999, y: 888 })
    expect(result.layoutState?.nodes.a).toMatchObject({
      position: { x: 999, y: 888 },
      source: 'manual',
      locked: true,
      updatedAt: 10,
    })
  })

  it('does not return persistent layout state in transient mode', () => {
    const result = layoutMindMap({
      root,
      graphData: outlineToGraph(root, new Set()),
      collapsedNodeIds: new Set(),
      strategy: 'balanced-mindmap',
      nodeSizes: {},
      mode: 'transient',
    })

    expect(result.layoutState).toBeUndefined()
  })

  it('lays out radial mind maps from the document root clockwise and deterministically', () => {
    const radialRoot = createNode('root', 'Root', [
      createNode('first', 'First'),
      createNode('second', 'Second'),
      createNode('third', 'Third'),
    ])
    const input = {
      root: radialRoot,
      graphData: outlineToGraph(radialRoot, new Set()),
      collapsedNodeIds: new Set<string>(),
      strategy: 'radial-mindmap' as const,
      nodeSizes: {},
      mode: 'persistent' as const,
    }

    const first = layoutMindMap(input)
    const second = layoutMindMap(input)
    const centerById = getCenterById(first.nodes)

    expect(centerById.root.x).toBeCloseTo(0)
    expect(centerById.root.y).toBeCloseTo(0)
    expect(centerById.first.x).toBeGreaterThan(centerById.root.x)
    expect(Math.abs(centerById.first.y)).toBeLessThan(1)
    expect(centerById.second.x).toBeLessThan(centerById.root.x)
    expect(centerById.second.y).toBeGreaterThan(centerById.root.y)
    expect(centerById.third.x).toBeLessThan(centerById.root.x)
    expect(centerById.third.y).toBeLessThan(centerById.root.y)
    expect(first.nodes.map((node) => [node.id, node.position])).toEqual(
      second.nodes.map((node) => [node.id, node.position]),
    )
    expect(first.layoutState).toMatchObject({
      engineVersion: 2,
      strategy: 'radial-mindmap',
    })
  })

  it('keeps radial child nodes inside their parent sector in outline order', () => {
    const radialRoot = createNode('root', 'Root', [
      createNode('topic', 'Topic', [
        createNode('topic-a', 'Topic A'),
        createNode('topic-b', 'Topic B'),
      ]),
      createNode('other', 'Other'),
    ])

    const result = layoutMindMap({
      root: radialRoot,
      graphData: outlineToGraph(radialRoot, new Set()),
      collapsedNodeIds: new Set(),
      strategy: 'radial-mindmap',
      nodeSizes: {},
      mode: 'persistent',
    })
    const centerById = getCenterById(result.nodes)

    expect(centerById.topic.x).toBeGreaterThan(centerById.root.x)
    expect(centerById['topic-a'].x).toBeGreaterThan(centerById.topic.x)
    expect(centerById['topic-b'].x).toBeGreaterThan(centerById.topic.x)
    expect(centerById['topic-a'].y).toBeLessThan(centerById.topic.y)
    expect(centerById['topic-b'].y).toBeGreaterThan(centerById.topic.y)
  })

  it('preserves locked radial nodes without moving automatic nodes', () => {
    const radialRoot = createNode('root', 'Root', [
      createNode('locked', 'Locked'),
      createNode('auto', 'Auto'),
    ])
    const baseInput = {
      root: radialRoot,
      graphData: outlineToGraph(radialRoot, new Set()),
      collapsedNodeIds: new Set<string>(),
      strategy: 'radial-mindmap' as const,
      nodeSizes: {},
      mode: 'persistent' as const,
    }
    const withoutLock = layoutMindMap(baseInput)
    const persistedLayout: MindMapLayoutState = {
      engineVersion: 2,
      strategy: 'radial-mindmap',
      nodes: {
        locked: {
          position: { x: 999, y: 888 },
          source: 'manual',
          locked: true,
          updatedAt: 10,
        },
      },
    }

    const withLock = layoutMindMap({
      ...baseInput,
      persistedLayout,
    })

    expect(withLock.nodes.find((node) => node.id === 'locked')?.position).toEqual({ x: 999, y: 888 })
    expect(withLock.nodes.find((node) => node.id === 'auto')?.position).toEqual(
      withoutLock.nodes.find((node) => node.id === 'auto')?.position,
    )
    expect(withLock.layoutState?.nodes.locked).toMatchObject({
      position: { x: 999, y: 888 },
      source: 'manual',
      locked: true,
      updatedAt: 10,
    })
  })

  it('estimates larger fallback sizes for nodes with rich content', () => {
    const plain = createNode('plain', '短')
    const rich = {
      ...createNode('rich', '这是一段明显更长的导图节点文本'),
      note: '备注',
      tags: ['项目'],
      checked: false,
    }

    expect(estimateMindMapNodeSize(rich).width).toBeGreaterThan(estimateMindMapNodeSize(plain).width)
    expect(estimateMindMapNodeSize(rich).height).toBeGreaterThan(estimateMindMapNodeSize(plain).height)
  })
})

function getCenterById(nodes: Array<{ id: string; position: { x: number; y: number } }>) {
  return Object.fromEntries(nodes.map((node) => [node.id, {
    x: node.position.x + 100,
    y: node.position.y + 22,
  }]))
}
