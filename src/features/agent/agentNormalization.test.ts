import { describe, expect, it } from 'vitest'
import {
  createOutlineNodeFromAgentInput,
  normalizeAgentOptionalText,
  normalizeAgentTags,
} from './agentNormalization'

describe('agentNormalization', () => {
  it('normalizes optional text and tags consistently', () => {
    expect(normalizeAgentOptionalText(null)).toBeUndefined()
    expect(normalizeAgentOptionalText('  说明  ')).toBe('说明')
    expect(normalizeAgentOptionalText('   ')).toBeUndefined()
    expect(normalizeAgentTags([' 计划 ', '', '重要', '计划'])).toEqual(['计划', '重要'])
  })

  it('creates outline nodes with existing ids for reviewed change plans', () => {
    const result = createOutlineNodeFromAgentInput(
      {
        id: 'agent-node',
        text: ' 新节点 ',
        note: ' 备注 ',
        tags: [' b ', 'a', 'b'],
        checked: null,
        children: [{ id: 'child-node', text: '子节点' }],
      },
      { now: 10, createId: (input) => input.id },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.node).toMatchObject({
      id: 'agent-node',
      text: '新节点',
      note: '备注',
      tags: ['a', 'b'],
      checked: undefined,
      createdAt: 10,
      updatedAt: 10,
      children: [{ id: 'child-node', text: '子节点' }],
    })
  })

  it('returns a validation error for empty descendant titles', () => {
    const result = createOutlineNodeFromAgentInput(
      { text: '父节点', children: [{ text: '   ' }] },
      { now: 10, createId: () => 'generated-id' },
    )

    expect(result).toEqual({
      ok: false,
      error: 'empty-title',
    })
  })
})
