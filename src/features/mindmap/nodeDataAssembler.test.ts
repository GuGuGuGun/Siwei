import { describe, expect, it } from 'vitest'
import type { Node } from 'reactflow'
import type { OutlineNode } from '../../types/document'
import { buildMindMapNodeSizes, attachLayoutNodeSizes } from './nodeDataAssembler'

function outlineNode(id: string, text = id, children: OutlineNode[] = []): OutlineNode {
  return {
    id,
    text,
    createdAt: 1,
    updatedAt: 1,
    children,
  }
}

describe('nodeDataAssembler', () => {
  it('uses measured sizes when available and estimates missing nodes', () => {
    const root = outlineNode('root', 'Root', [outlineNode('child', 'A child with longer text')])

    const sizes = buildMindMapNodeSizes(root, { root: { width: 300, height: 80 } })

    expect(sizes.root).toEqual({ width: 300, height: 80 })
    expect(sizes.child.width).toBeGreaterThan(0)
    expect(sizes.child.height).toBeGreaterThan(0)
  })

  it('attaches known layout sizes without changing nodes that have no size entry', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 0, y: 0 }, data: {}, width: 10 },
    ]

    expect(attachLayoutNodeSizes(nodes, { a: { width: 120, height: 44 } })).toEqual([
      { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 120, height: 44 },
      { id: 'b', position: { x: 0, y: 0 }, data: {}, width: 10 },
    ])
  })
})
