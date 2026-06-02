import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../types/document'
import { applyAgentOperation } from './agentTreeOperations'

function node(id: string, children: OutlineNode[] = []): OutlineNode {
  return {
    id,
    text: id,
    createdAt: 1,
    updatedAt: 1,
    children,
  }
}

describe('agentTreeOperations', () => {
  it('applies insert, update, delete, and move operations to a tree', () => {
    let root = node('root', [node('a', [node('a1')]), node('b')])
    const now = 20

    const update = applyAgentOperation(root, { type: 'updateNode', nodeId: 'b', text: 'B' }, now)
    expect(update.ok).toBe(true)
    if (!update.ok) return
    root = update.root
    expect(root.children[1].text).toBe('B')

    const insert = applyAgentOperation(root, {
      type: 'insertNode',
      parentNodeId: 'a',
      index: 1,
      node: { id: 'a2', text: 'A2' },
    }, now)
    expect(insert.ok).toBe(true)
    if (!insert.ok) return
    root = insert.root
    expect(root.children[0].children.map((child) => child.id)).toEqual(['a1', 'a2'])

    const move = applyAgentOperation(root, {
      type: 'moveNode',
      nodeId: 'b',
      targetParentNodeId: 'a',
      index: 0,
    }, now)
    expect(move.ok).toBe(true)
    if (!move.ok) return
    root = move.root
    expect(root.children[0].children.map((child) => child.id)).toEqual(['b', 'a1', 'a2'])

    const remove = applyAgentOperation(root, { type: 'deleteNode', nodeId: 'a1' }, now)
    expect(remove.ok).toBe(true)
    if (!remove.ok) return
    expect(remove.root.children[0].children.map((child) => child.id)).toEqual(['b', 'a2'])
  })

  it('rejects invalid moves that would create a cycle', () => {
    const root = node('root', [node('a', [node('a1')])])

    expect(applyAgentOperation(root, {
      type: 'moveNode',
      nodeId: 'a',
      targetParentNodeId: 'a1',
      index: 0,
    }, 20)).toEqual({
      ok: false,
      error: '不能将节点移动到自身或其子节点下',
    })
  })
})
