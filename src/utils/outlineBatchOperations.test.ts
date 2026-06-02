import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../types/document'
import {
  getTopLevelSelectedNodeIds,
  indentSelectedNodes,
  moveSelectedNodes,
  outdentSelectedNodes,
} from './outlineBatchOperations'

function node(id: string, children: OutlineNode[] = []): OutlineNode {
  return {
    id,
    text: id,
    createdAt: 1,
    updatedAt: 1,
    children,
  }
}

function shape(root: OutlineNode): unknown {
  return root.children.map((child) => ({
    id: child.id,
    children: child.children.map((grandchild) => ({
      id: grandchild.id,
      children: grandchild.children.map((item) => item.id),
    })),
  }))
}

describe('outlineBatchOperations', () => {
  it('keeps only highest selected nodes when parent and child are selected together', () => {
    const root = node('root', [node('a', [node('a1')]), node('b')])

    expect(getTopLevelSelectedNodeIds(root, ['a', 'a1', 'b'])).toEqual(['a', 'b'])
  })

  it('moves selected siblings down while preserving their relative order', () => {
    const root = node('root', [node('a'), node('b'), node('c'), node('d')])

    const result = moveSelectedNodes(root, ['b', 'c'], 'down')

    expect(result.changed).toBe(true)
    expect(result.root.children.map((child) => child.id)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves selected siblings up while preserving their relative order', () => {
    const root = node('root', [node('a'), node('b'), node('c'), node('d')])

    const result = moveSelectedNodes(root, ['b', 'c'], 'up')

    expect(result.changed).toBe(true)
    expect(result.root.children.map((child) => child.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('indents selected nodes under the previous visible sibling without moving descendants twice', () => {
    const root = node('root', [node('a'), node('b', [node('b1')]), node('c')])

    const result = indentSelectedNodes(root, ['b', 'b1', 'c'])

    expect(result.changed).toBe(true)
    expect(shape(result.root)).toEqual([
      {
        id: 'a',
        children: [
          { id: 'b', children: ['b1'] },
          { id: 'c', children: [] },
        ],
      },
    ])
  })

  it('outdents selected children after their parent', () => {
    const root = node('root', [node('a', [node('a1'), node('a2')]), node('b')])

    const result = outdentSelectedNodes(root, ['a1', 'a2'])

    expect(result.changed).toBe(true)
    expect(shape(result.root)).toEqual([
      { id: 'a', children: [] },
      { id: 'a1', children: [] },
      { id: 'a2', children: [] },
      { id: 'b', children: [] },
    ])
  })

  it('returns unchanged result for illegal batch moves', () => {
    const root = node('root', [node('a'), node('b')])

    expect(moveSelectedNodes(root, ['a'], 'up')).toEqual({ root, changed: false })
    expect(indentSelectedNodes(root, ['a'])).toEqual({ root, changed: false })
    expect(outdentSelectedNodes(root, ['a'])).toEqual({ root, changed: false })
  })
})
