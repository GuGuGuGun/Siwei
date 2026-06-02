import { describe, expect, it } from 'vitest'

import { createDocument } from '../../test/fixtures'
import { createDocumentSnapshotKey } from './agentChangePlan'
import {
  createMindMapDeletePlan,
  createMindMapInsertPlan,
  createMindMapMovePlan,
  createMindMapUpdatePlan,
  normalizeMindMapInsertNodesParams,
  normalizeMindMapUpdateNodesParams,
} from './agentToolPlans'

describe('agentToolPlans', () => {
  it('normalizes nested insert params and rejects malformed descendants', () => {
    expect(normalizeMindMapInsertNodesParams({
      documentId: 'doc-1',
      snapshotKey: 'snapshot',
      parentNodeId: 'root',
      nodes: [{ text: '父节点', children: [{ text: '子节点' }] }],
    })).toMatchObject({
      documentId: 'doc-1',
      parentNodeId: 'root',
      nodes: [{ text: '父节点', children: [{ text: '子节点' }] }],
    })

    expect(normalizeMindMapInsertNodesParams({
      documentId: 'doc-1',
      snapshotKey: 'snapshot',
      parentNodeId: 'root',
      nodes: [{ text: '父节点', children: [{ title: '缺少 text' }] }],
    })).toBeNull()
  })

  it('creates an insert plan with generated node ids and validated position', () => {
    const doc = createDocument()
    const result = createMindMapInsertPlan(doc, {
      documentId: doc.id,
      snapshotKey: createDocumentSnapshotKey(doc),
      parentNodeId: 'node-1',
      index: 1,
      nodes: [
        {
          text: ' 新节点 ',
          note: '备注',
          tags: ['计划'],
          checked: true,
          children: [{ text: '子节点' }],
        },
      ],
    }, () => 'generated-id')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan).toMatchObject({
      riskLevel: 'low',
      summary: '待确认插入 1 个主题，包含 1 个子节点',
      operations: [
        {
          type: 'insertNode',
          parentNodeId: 'node-1',
          index: 1,
          node: {
            id: 'generated-id',
            text: '新节点',
            note: '备注',
            tags: ['计划'],
            checked: true,
            children: [{ id: 'generated-id', text: '子节点' }],
          },
        },
      ],
    })
  })

  it('creates update, move, and delete plans with current-document references', () => {
    const doc = createDocument()
    const snapshotKey = createDocumentSnapshotKey(doc)

    const update = createMindMapUpdatePlan(doc, {
      documentId: doc.id,
      snapshotKey,
      updates: [{ nodeId: 'node-1-1', text: '更新子节点' }],
    })
    expect(update.ok).toBe(true)
    if (!update.ok) return
    expect(update.plan.references).toEqual([
      {
        sourceType: 'currentDocument',
        documentId: doc.id,
        documentTitle: doc.title,
        nodeId: 'node-1-1',
        path: ['第一节点', '第一子节点'],
        snippet: '第一子节点',
      },
    ])

    const move = createMindMapMovePlan(doc, {
      documentId: doc.id,
      snapshotKey,
      moves: [{ nodeId: 'node-2', targetParentNodeId: 'node-1', index: 0 }],
    })
    expect(move.ok).toBe(true)
    if (!move.ok) return
    expect(move.plan.riskLevel).toBe('medium')

    const remove = createMindMapDeletePlan(doc, {
      documentId: doc.id,
      snapshotKey,
      deletes: [{ nodeId: 'node-1', reason: '清理重复分支' }],
    })
    expect(remove.ok).toBe(true)
    if (!remove.ok) return
    expect(remove.plan.riskLevel).toBe('high')
    expect(remove.plan.operations).toEqual([
      { type: 'deleteNode', nodeId: 'node-1', reason: '清理重复分支' },
    ])
  })

  it('rejects stale snapshots and invalid update payloads', () => {
    const doc = createDocument()

    expect(createMindMapMovePlan(doc, {
      documentId: doc.id,
      snapshotKey: 'stale',
      moves: [{ nodeId: 'node-2', targetParentNodeId: 'node-1', index: 0 }],
    })).toEqual({
      ok: false,
      error: '当前文档已变化，请让助理重新生成节点',
    })

    expect(normalizeMindMapUpdateNodesParams({
      documentId: doc.id,
      snapshotKey: createDocumentSnapshotKey(doc),
      updates: [{ text: '缺少 nodeId' }],
    })).toBeNull()
  })
})
