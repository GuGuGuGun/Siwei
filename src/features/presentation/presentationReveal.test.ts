import { describe, expect, it } from 'vitest'
import { createNode } from '../../test/fixtures'
import {
  collectPresentationNodeMeta,
  createRevealProgress,
  createVisibleNodeIdSet,
  getMaxRevealDepth,
} from './presentationReveal'

describe('presentationReveal', () => {
  const root = createNode('root', '根节点', [
    createNode('a', '一级 A', [
      createNode('a-1', '二级 A-1', [
        createNode('a-1-1', '三级 A-1-1'),
      ]),
    ]),
    createNode('b', '一级 B'),
  ])

  it('calculates reveal bounds and visible nodes by depth', () => {
    expect(getMaxRevealDepth(root)).toBe(3)

    expect([...createVisibleNodeIdSet(root, 0)]).toEqual(['root'])
    expect([...createVisibleNodeIdSet(root, 1)]).toEqual(['root', 'a', 'b'])
    expect([...createVisibleNodeIdSet(root, 2)]).toEqual(['root', 'a', 'a-1', 'b'])
  })

  it('creates stable user-facing progress for the visible reveal layer', () => {
    expect(createRevealProgress(root, -1)).toEqual({
      currentDepth: 0,
      maxDepth: 3,
      currentStep: 1,
      totalSteps: 4,
      label: '第 1 / 4 层',
    })
    expect(createRevealProgress(root, 2).label).toBe('第 3 / 4 层')
    expect(createRevealProgress(root, 99)).toEqual({
      currentDepth: 3,
      maxDepth: 3,
      currentStep: 4,
      totalSteps: 4,
      label: '第 4 / 4 层',
    })
  })

  it('keeps node metadata available for mind map presentation nodes', () => {
    const meta = collectPresentationNodeMeta(root)

    expect(meta.get('root')).toEqual({ depth: 0, childCount: 2 })
    expect(meta.get('a')).toEqual({ depth: 1, childCount: 1 })
    expect(meta.get('a-1-1')).toEqual({ depth: 3, childCount: 0 })
  })
})
