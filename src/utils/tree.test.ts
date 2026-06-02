import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../types/document'
import {
  adjustTargetPathAfterNodeRemoval,
  findNodeById,
  getNodeAtPath,
  isTreePathPrefix,
  moveNodeToParentIndexAtPath,
} from './tree'

function node(id: string, children: OutlineNode[] = []): OutlineNode {
  return {
    id,
    text: id,
    createdAt: 1,
    updatedAt: 1,
    children,
  }
}

function ids(root: OutlineNode): unknown {
  return root.children.map((child) => ({
    id: child.id,
    children: child.children.map((grandchild) => grandchild.id),
  }))
}

describe('tree moveNodeToParentIndexAtPath', () => {
  it('moves a node across parents at a target index', () => {
    const root = node('root', [node('a', [node('a1')]), node('b'), node('c')])

    const moved = moveNodeToParentIndexAtPath(root, [0, 0], [], 2)

    expect(ids(moved)).toEqual([
      { id: 'a', children: [] },
      { id: 'b', children: [] },
      { id: 'a1', children: [] },
      { id: 'c', children: [] },
    ])
  })

  it('moves an earlier sibling under a later sibling after target path shifts', () => {
    const root = node('root', [node('a'), node('b'), node('c')])

    const moved = moveNodeToParentIndexAtPath(root, [0], [1], 0)

    expect(ids(moved)).toEqual([
      { id: 'b', children: ['a'] },
      { id: 'c', children: [] },
    ])
  })

  it('inserts before and after siblings in the same parent', () => {
    const root = node('root', [node('a'), node('b'), node('c')])

    const before = moveNodeToParentIndexAtPath(root, [2], [], 0)
    expect(before.children.map((child) => child.id)).toEqual(['c', 'a', 'b'])

    const after = moveNodeToParentIndexAtPath(root, [0], [], 3)
    expect(after.children.map((child) => child.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not move root, self, or a node under its own descendant', () => {
    const root = node('root', [node('a', [node('a1')]), node('b')])

    expect(moveNodeToParentIndexAtPath(root, [], [], 1)).toBe(root)
    expect(moveNodeToParentIndexAtPath(root, [0], [0], 0)).toBe(root)
    expect(moveNodeToParentIndexAtPath(root, [0], [0, 0], 0)).toBe(root)
  })

  it('returns the original tree for invalid paths', () => {
    const root = node('root', [node('a'), node('b')])

    expect(moveNodeToParentIndexAtPath(root, [9], [], 0)).toBe(root)
    expect(moveNodeToParentIndexAtPath(root, [0], [9], 0)).toBe(root)
    expect(moveNodeToParentIndexAtPath(root, [0], [], -1)).toBe(root)
  })
})

describe('tree id-based adapters', () => {
  it('finds a node and its index path by id', () => {
    const root = node('root', [node('a', [node('a1'), node('a2')]), node('b')])

    expect(findNodeById(root, 'a2')).toEqual({
      node: root.children[0].children[1],
      path: [0, 1],
    })
    expect(findNodeById(root, 'missing')).toBeNull()
  })

  it('returns a node by path and rejects invalid paths', () => {
    const root = node('root', [node('a', [node('a1')]), node('b')])

    expect(getNodeAtPath(root, [])).toBe(root)
    expect(getNodeAtPath(root, [0, 0])).toBe(root.children[0].children[0])
    expect(getNodeAtPath(root, [0, 9])).toBeNull()
    expect(getNodeAtPath(root, [-1])).toBeNull()
  })

  it('checks tree path ancestry without treating siblings as descendants', () => {
    expect(isTreePathPrefix([0], [0, 1])).toBe(true)
    expect(isTreePathPrefix([0], [0])).toBe(true)
    expect(isTreePathPrefix([0, 1], [0])).toBe(false)
    expect(isTreePathPrefix([0], [1, 0])).toBe(false)
  })

  it('adjusts a target parent path after removing an earlier source node', () => {
    expect(adjustTargetPathAfterNodeRemoval([0], [1])).toEqual([0])
    expect(adjustTargetPathAfterNodeRemoval([1], [0])).toEqual([0])
    expect(adjustTargetPathAfterNodeRemoval([0, 1], [0, 2, 0])).toEqual([0, 1, 0])
    expect(adjustTargetPathAfterNodeRemoval([0, 1], [1, 0])).toEqual([1, 0])
  })
})
