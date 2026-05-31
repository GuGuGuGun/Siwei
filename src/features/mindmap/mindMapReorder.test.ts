import { describe, expect, it } from 'vitest'
import {
  getMindMapDropZone,
  resolveMindMapDragTarget,
  resolveMindMapDropMove,
  resolveMindMapDropMoveResult,
} from './mindMapReorder'

describe('mindMapReorder', () => {
  it('maps node vertical thirds into before child and after drop zones', () => {
    expect(getMindMapDropZone(10, 0, 100)).toBe('before')
    expect(getMindMapDropZone(50, 0, 100)).toBe('child')
    expect(getMindMapDropZone(90, 0, 100)).toBe('after')
  })

  it('resolves before child and after moves into parent/index operations', () => {
    expect(resolveMindMapDropMove({
      sourceNodeId: 'dragged',
      targetNodeId: 'target',
      zone: 'before',
      targetParentId: 'root',
      targetIndex: 2,
      targetChildCount: 0,
    })).toEqual({ parentNodeId: 'root', targetIndex: 2 })

    expect(resolveMindMapDropMove({
      sourceNodeId: 'dragged',
      targetNodeId: 'target',
      zone: 'child',
      targetParentId: 'root',
      targetIndex: 2,
      targetChildCount: 3,
    })).toEqual({ parentNodeId: 'target', targetIndex: 3 })

    expect(resolveMindMapDropMove({
      sourceNodeId: 'dragged',
      targetNodeId: 'target',
      zone: 'after',
      targetParentId: 'root',
      targetIndex: 2,
      targetChildCount: 0,
    })).toEqual({ parentNodeId: 'root', targetIndex: 3 })
  })

  it('resolves a ReactFlow drag stop position into a target node drop zone', () => {
    expect(resolveMindMapDragTarget(
      { id: 'dragged', position: { x: 110, y: -12 }, width: 200, height: 44 },
      [
        { id: 'target', position: { x: 200, y: 0 }, width: 200, height: 80 },
        { id: 'dragged', position: { x: 110, y: -12 }, width: 200, height: 44 },
      ],
    )).toEqual({ targetNodeId: 'target', zone: 'before' })

    expect(resolveMindMapDragTarget(
      { id: 'dragged', position: { x: 110, y: 48 }, width: 200, height: 44 },
      [
        { id: 'target', position: { x: 200, y: 0 }, width: 200, height: 80 },
        { id: 'dragged', position: { x: 110, y: 48 }, width: 200, height: 44 },
      ],
    )).toEqual({ targetNodeId: 'target', zone: 'after' })
  })

  it('ignores self and root-level sibling drops without a parent', () => {
    expect(resolveMindMapDropMove({
      sourceNodeId: 'target',
      targetNodeId: 'target',
      zone: 'child',
      targetParentId: 'root',
      targetIndex: 0,
      targetChildCount: 0,
    })).toBeNull()

    expect(resolveMindMapDropMove({
      sourceNodeId: 'dragged',
      targetNodeId: 'root',
      zone: 'before',
      targetParentId: null,
      targetIndex: undefined,
      targetChildCount: 0,
    })).toBeNull()
  })

  it('rejects root moves and drops onto descendants', () => {
    expect(resolveMindMapDropMove({
      sourceNodeId: 'root',
      targetNodeId: 'node-1',
      zone: 'child',
      targetParentId: 'root',
      targetIndex: 0,
      targetChildCount: 0,
      rootNodeId: 'root',
      descendantNodeIds: new Set<string>(),
    })).toBeNull()

    expect(resolveMindMapDropMove({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-1-1',
      zone: 'child',
      targetParentId: 'node-1',
      targetIndex: 0,
      targetChildCount: 0,
      rootNodeId: 'root',
      descendantNodeIds: new Set(['node-1-1']),
    })).toBeNull()
  })

  it('explains invalid drop reasons for user-facing feedback', () => {
    expect(resolveMindMapDropMoveResult({
      sourceNodeId: 'root',
      targetNodeId: 'node-1',
      zone: 'child',
      targetParentId: 'root',
      targetIndex: 0,
      targetChildCount: 0,
      rootNodeId: 'root',
    })).toEqual({ reason: '无法移动根节点' })

    expect(resolveMindMapDropMoveResult({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-1-1',
      zone: 'child',
      targetParentId: 'node-1',
      targetIndex: 0,
      targetChildCount: 0,
      rootNodeId: 'root',
      descendantNodeIds: new Set(['node-1-1']),
    })).toEqual({ reason: '无法移动到自己的子节点下' })
  })
})
