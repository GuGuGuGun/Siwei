import { describe, expect, it } from 'vitest'
import type { Edge, Node } from 'reactflow'
import { createBranchSideKey, filterCollapsedBranchSides } from './branchSideCollapse'

function flowNode(id: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: id },
  }
}

describe('branchSideCollapse', () => {
  it('filters a collapsed branch side based on layout edge handles', () => {
    const graph = {
      nodes: ['root', 'left', 'left-child', 'right'].map(flowNode),
      edges: [
        { id: 'root-left', source: 'root', target: 'left', sourceHandle: 'left-source' },
        { id: 'left-child', source: 'left', target: 'left-child' },
        { id: 'root-right', source: 'root', target: 'right', sourceHandle: 'right-source' },
      ] as Edge[],
    }

    const filtered = filterCollapsedBranchSides(
      graph,
      graph.edges,
      new Set([createBranchSideKey('root', 'left')]),
    )

    expect(filtered.nodes.map((node) => node.id)).toEqual(['root', 'right'])
    expect(filtered.edges.map((edge) => edge.id)).toEqual(['root-right'])
  })

  it('returns the original graph when no side matches', () => {
    const graph = {
      nodes: ['root', 'left'].map(flowNode),
      edges: [{ id: 'root-left', source: 'root', target: 'left', sourceHandle: 'left-source' }] as Edge[],
    }

    expect(filterCollapsedBranchSides(graph, graph.edges, new Set([createBranchSideKey('root', 'right')]))).toBe(graph)
  })
})
