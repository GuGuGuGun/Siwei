import { describe, expect, it } from 'vitest'
import { createNode } from '../../test/fixtures'
import {
  collectTags,
  collectTasks,
  filterVisibleTree,
  findNodePath,
  normalizeTagList,
} from './filterUtils'

describe('filterUtils', () => {
  const root = createNode('root', '根节点', [
    {
      ...createNode('plan', '发布计划', [
        {
          ...createNode('api', 'API 验收'),
          checked: true,
          tags: ['工作'],
          note: '接口 smoke 通过',
        },
      ]),
      tags: ['工作', '重要'],
      checked: false,
    },
    {
      ...createNode('idea', '灵感整理'),
      tags: ['生活', '工作', '工作', 'bad tag', '#bad'],
      note: '包含备注关键词',
    },
  ])

  it('normalizes tags by trimming, rejecting invalid tags, and preserving case', () => {
    expect(normalizeTagList([' 工作 ', '', 'Work', 'Work', 'bad tag', '#bad', '换\n行'])).toEqual([
      '工作',
      'Work',
    ])
  })

  it('collects tag counts and node ids from the document tree', () => {
    expect(collectTags(root)).toEqual([
      { tag: '工作', count: 3, nodeIds: ['plan', 'api', 'idea'] },
      { tag: '生活', count: 1, nodeIds: ['idea'] },
      { tag: '重要', count: 1, nodeIds: ['plan'] },
    ])
  })

  it('collects task nodes with parent text path', () => {
    expect(collectTasks(root)).toEqual([
      {
        nodeId: 'plan',
        text: '发布计划',
        checked: false,
        path: [],
        tags: ['工作', '重要'],
      },
      {
        nodeId: 'api',
        text: 'API 验收',
        checked: true,
        path: ['发布计划'],
        tags: ['工作'],
      },
    ])
  })

  it('filters visible tree while preserving ancestor path context', () => {
    const result = filterVisibleTree(root, new Set(), {
      query: 'smoke',
      tag: '工作',
      checked: 'checked',
    })

    expect(result.nodes.map((item) => item.node.id)).toEqual(['plan', 'api'])
    expect([...result.matchingNodeIds]).toEqual(['api'])
  })

  it('returns node object path from root to target', () => {
    expect(findNodePath(root, 'api')?.map((node) => node.id)).toEqual(['root', 'plan', 'api'])
    expect(findNodePath(root, 'missing')).toBeNull()
  })
})
