import { describe, expect, it } from 'vitest'
import { createDocument } from '../../test/fixtures'
import {
  getAncestorIds,
  getNodeDepthMap,
  getNodeSubtree,
  getVisibleMindMapNodeIds,
  searchOutlineNodes,
} from './mindMapSelectors'

describe('mindMapSelectors', () => {
  it('derives subtree and visible node ids with focus and collapsed state', () => {
    const doc = createDocument()

    expect(getNodeSubtree(doc.root, 'node-1')?.id).toBe('node-1')
    expect(getVisibleMindMapNodeIds(doc.root, new Set(['node-1']), null)).toEqual([
      'root',
      'node-1',
      'node-2',
    ])
    expect(getVisibleMindMapNodeIds(doc.root, new Set<string>(), 'node-1')).toEqual([
      'node-1',
      'node-1-1',
    ])
    expect(getVisibleMindMapNodeIds(doc.root, new Set(['node-1']), 'node-1')).toEqual(['node-1'])
    expect(getVisibleMindMapNodeIds(doc.root, new Set<string>(), 'root')).toEqual([
      'root',
      'node-1',
      'node-1-1',
      'node-2',
    ])
  })

  it('derives depths, ancestors, and search matches', () => {
    const doc = createDocument()
    doc.root.children[1] = {
      ...doc.root.children[1],
      text: '第二节点 Alpha',
      tags: ['AlphaTag'],
      note: '备注 Alpha',
    }

    expect(getNodeDepthMap(doc.root).get('root')).toBe(0)
    expect(getNodeDepthMap(doc.root).get('node-1-1')).toBe(2)
    expect(getAncestorIds(doc.root, 'node-1-1')).toEqual(['root', 'node-1'])

    const matches = searchOutlineNodes(doc.root, 'alpha', new Set(['root', 'node-2']))
    expect(matches).toEqual(['node-2'])
  })
})
