import { describe, expect, it } from 'vitest'
import type { AgentChangePlan } from './agentTypes'
import { validatePlanRiskSemantics } from './agentPlanValidation'

describe('agentPlanValidation', () => {
  const basePlan: AgentChangePlan = {
    schemaVersion: 1,
    contextScope: 'currentDocument',
    documentId: 'doc',
    snapshotKey: 'snapshot',
    summary: '计划',
    rationale: '理由',
    riskLevel: 'low',
    references: [],
    operations: [],
  }

  it('allows low-risk plans without delete operations', () => {
    expect(validatePlanRiskSemantics({
      ...basePlan,
      operations: [{ type: 'updateNode', nodeId: 'node-1', text: '更新' }],
    })).toEqual({ ok: true })
  })

  it('requires high-risk semantics for delete operations', () => {
    expect(validatePlanRiskSemantics({
      ...basePlan,
      operations: [{ type: 'deleteNode', nodeId: 'node-1', reason: '删除' }],
    })).toEqual({ ok: false, error: '删除节点必须标记为高风险' })

    expect(validatePlanRiskSemantics({
      ...basePlan,
      riskLevel: 'high',
      rationale: '',
      operations: [{ type: 'deleteNode', nodeId: 'node-1' }],
    })).toEqual({ ok: false, error: '高风险删除缺少引用或理由' })
  })
})
