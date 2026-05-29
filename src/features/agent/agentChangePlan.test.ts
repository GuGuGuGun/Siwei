import { describe, expect, it } from 'vitest'

import { createDocument } from '../../test/fixtures'
import {
  applyAgentChangePlanToDocument,
  createDocumentSnapshotKey,
  createAgentDocumentPreview,
  validateAgentChangePlan,
} from './agentChangePlan'
import type { AgentChangePlan, AgentOperation } from './agentTypes'

describe('agentChangePlan', () => {
  it('updates, inserts, moves, and deletes nodes through a validated plan', () => {
    const doc = createDocument()
    const plan = createStrictPlan(
      doc.id,
      createDocumentSnapshotKey(doc),
      [
        {
          type: 'updateNode',
          nodeId: 'node-2',
          text: '第二节点改写',
          note: '补充说明',
          tags: ['工作', '重要'],
          checked: false,
        },
        {
          type: 'insertNode',
          parentNodeId: 'node-1',
          index: 1,
          node: {
            id: 'agent-node',
            text: '新增节点',
            note: '新增备注',
            tags: ['新增'],
            checked: true,
          },
        },
        {
          type: 'moveNode',
          nodeId: 'node-2',
          targetParentNodeId: 'node-1',
          index: 0,
        },
        {
          type: 'deleteNode',
          nodeId: 'node-1-1',
        },
      ],
    )

    const result = applyAgentChangePlanToDocument(doc, plan)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.root.children.map((node) => node.id)).toEqual(['node-1'])
    expect(result.document.root.children[0].children.map((node) => node.id)).toEqual([
      'node-2',
      'agent-node',
    ])
    expect(result.document.root.children[0].children[0]).toMatchObject({
      text: '第二节点改写',
      note: '补充说明',
      tags: ['工作', '重要'],
      checked: false,
    })
  })

  it('rejects stale plans and keeps the document unchanged', () => {
    const doc = createDocument()
    const plan = createStrictPlan(
      doc.id,
      'stale',
      [
        {
          type: 'updateNode',
          nodeId: 'node-2',
          text: '不应应用',
        },
      ],
    )

    const result = applyAgentChangePlanToDocument(doc, plan)

    expect(result).toEqual({
      ok: false,
      error: '当前文档已变化，请让助理重新生成修改计划',
    })
  })

  it('rejects deleting the root node and moving a node into its own descendant', () => {
    const doc = createDocument()

    expect(validateAgentChangePlan(doc, createStrictPlan(
      doc.id,
      createDocumentSnapshotKey(doc),
      [{ type: 'deleteNode', nodeId: 'root' }],
    ))).toEqual({
      ok: false,
      error: '不能删除根节点',
    })

    expect(validateAgentChangePlan(doc, createStrictPlan(
      doc.id,
      createDocumentSnapshotKey(doc),
      [
        {
          type: 'moveNode',
          nodeId: 'node-1',
          targetParentNodeId: 'node-1-1',
          index: 0,
        },
      ],
    ))).toEqual({
      ok: false,
      error: '不能将节点移动到自身或其子节点下',
    })
  })

  it('rejects duplicate inserted node ids and invalid insertion positions', () => {
    const doc = createDocument()
    const snapshotKey = createDocumentSnapshotKey(doc)

    expect(validateAgentChangePlan(doc, createStrictPlan(
      doc.id,
      snapshotKey,
      [
        {
          type: 'insertNode',
          parentNodeId: 'node-1',
          index: 0,
          node: { id: 'node-2', text: '重复 ID' },
        },
      ],
    ))).toEqual({
      ok: false,
      error: '节点 ID 已存在: node-2',
    })

    expect(validateAgentChangePlan(doc, createStrictPlan(
      doc.id,
      snapshotKey,
      [
        {
          type: 'insertNode',
          parentNodeId: 'node-1',
          index: 99,
          node: { id: 'new-node', text: '越界' },
        },
      ],
    ))).toEqual({
      ok: false,
      error: '插入位置无效: node-1[99]',
    })
  })

  it('creates node-level previews without exposing the raw change plan to UI', () => {
    const doc = createDocument()
    const preview = createAgentDocumentPreview(createStrictPlan(
      doc.id,
      createDocumentSnapshotKey(doc),
      [
        {
          type: 'updateNode',
          nodeId: 'node-2',
          text: '助理改写',
          checked: true,
        },
        {
          type: 'insertNode',
          parentNodeId: 'node-1',
          index: 1,
          node: { id: 'agent-node', text: '新增节点' },
        },
        {
          type: 'deleteNode',
          nodeId: 'node-1-1',
        },
        {
          type: 'moveNode',
          nodeId: 'node-1',
          targetParentNodeId: 'root',
          index: 1,
        },
      ],
    ))

    expect(preview.nodePreviews.get('node-2')).toMatchObject({
      kind: 'update',
      text: '助理改写',
      checked: true,
    })
    expect(preview.nodePreviews.get('node-1-1')).toEqual({ kind: 'delete' })
    expect(preview.nodePreviews.get('node-1')).toMatchObject({
      kind: 'move',
      targetParentNodeId: 'root',
      index: 1,
    })
    expect(preview.insertionsByParentId.get('node-1')).toEqual([
      {
        index: 1,
        node: { id: 'agent-node', text: '新增节点' },
      },
    ])
  })
})

function createStrictPlan(
  documentId: string,
  snapshotKey: string,
  operations: AgentOperation[],
): AgentChangePlan {
  return {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId,
    snapshotKey,
    summary: '测试修改计划',
    rationale: '验证严格计划协议下的文档变更逻辑',
    riskLevel: 'low',
    references: [],
    operations,
  }
}
