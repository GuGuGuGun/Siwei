import { describe, expect, it } from 'vitest'

import { createDocument } from '../../test/fixtures'
import { createDocumentSnapshotKey } from './agentChangePlan'
import { parseAgentResponseText } from './agentPlanParser'

describe('agentPlanParser', () => {
  it('accepts strict audited change plans as the primary protocol', () => {
    const doc = createDocument()
    const result = parseAgentResponseText(JSON.stringify({
      schemaVersion: 1,
      contextScope: 'currentDocument',
      documentId: doc.id,
      snapshotKey: createDocumentSnapshotKey(doc),
      summary: '整理章节标题',
      rationale: '用户要求统一表达方式',
      riskLevel: 'low',
      references: [
        {
          sourceType: 'currentDocument',
          documentId: doc.id,
          nodeId: 'node-1',
          path: ['根节点'],
          snippet: '旧标题',
        },
      ],
      operations: [
        {
          type: 'updateNode',
          nodeId: 'node-1',
          text: '新标题',
        },
      ],
    }), doc)

    expect(result).toMatchObject({
      kind: 'plan',
      legacy: false,
      plan: {
        summary: '整理章节标题',
        rationale: '用户要求统一表达方式',
        riskLevel: 'low',
        references: [{ sourceType: 'currentDocument', nodeId: 'node-1' }],
      },
    })
  })

  it('returns an assistant message warning when edit output is not a strict plan', () => {
    const doc = createDocument()
    const result = parseAgentResponseText(JSON.stringify({
      documentId: doc.id,
      snapshotKey: createDocumentSnapshotKey(doc),
      operations: [
        { type: 'updateNode', nodeId: 'node-1', text: '缺少审核字段' },
      ],
    }), doc)

    expect(result).toEqual({
      kind: 'message',
      text: expect.stringContaining('documentId'),
      warning: '未生成可应用修改',
    })
  })

  it('keeps legacy parsing isolated from the strict protocol', () => {
    const doc = createDocument()
    const result = parseAgentResponseText(JSON.stringify({
      title: '计算器开发',
      children: [
        { title: '需求分析' },
        { title: '界面设计' },
      ],
    }), doc)

    expect(result).toMatchObject({
      kind: 'plan',
      legacy: true,
      plan: {
        schemaVersion: 1,
        contextScope: 'currentDocument',
        summary: '兼容旧格式生成的修改计划',
        riskLevel: 'medium',
        operations: [
          {
            type: 'insertNode',
            parentNodeId: doc.root.id,
            node: {
              text: '计算器开发',
              children: [
                { text: '需求分析' },
                { text: '界面设计' },
              ],
            },
          },
        ],
      },
    })
  })

  it('converts PiAgentCore node-wrapped insert operations into preview plans', () => {
    const doc = createDocument()
    const result = parseAgentResponseText(JSON.stringify({
      insertNode: {
        parentNodeId: doc.root.id,
        index: 2,
        node: {
          text: '界面设计',
          children: [
            { text: '布局：显示区、数字键区、运算符区、功能键区' },
            { text: '交互：点击反馈、键盘快捷键' },
          ],
        },
      },
    }), doc)

    expect(result).toMatchObject({
      kind: 'plan',
      legacy: true,
      plan: {
        operations: [
          {
            type: 'insertNode',
            parentNodeId: doc.root.id,
            index: 2,
            node: {
              text: '界面设计',
              children: [
                { text: '布局：显示区、数字键区、运算符区、功能键区' },
                { text: '交互：点击反馈、键盘快捷键' },
              ],
            },
          },
        ],
      },
    })
  })

  it('converts concatenated node-wrapped insert operations without exposing raw JSON', () => {
    const doc = createDocument()
    const text = [
      JSON.stringify({
        insertNode: {
          parentNodeId: doc.root.id,
          index: 0,
          node: { text: '核心功能', children: [{ text: '加减乘除' }] },
        },
      }),
      JSON.stringify({
        insertNode: {
          parentNodeId: doc.root.id,
          index: 1,
          node: { text: '测试计划', children: [{ text: '异常输入' }] },
        },
      }),
    ].join(',')

    const result = parseAgentResponseText(text, doc)

    expect(result).toMatchObject({
      kind: 'plan',
      legacy: true,
      plan: {
        operations: [
          {
            type: 'insertNode',
            index: 0,
            node: { text: '核心功能', children: [{ text: '加减乘除' }] },
          },
          {
            type: 'insertNode',
            index: 1,
            node: { text: '测试计划', children: [{ text: '异常输入' }] },
          },
        ],
      },
    })
  })
})
