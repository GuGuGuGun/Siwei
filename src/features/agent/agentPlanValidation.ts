import type { AgentChangePlan } from './agentTypes'

export function validatePlanRiskSemantics(plan: AgentChangePlan): { ok: true } | { ok: false; error: string } {
  const deleteOperations = plan.operations.filter((operation) => operation.type === 'deleteNode')
  if (deleteOperations.length === 0) return { ok: true }
  // 删除会造成不可逆信息损失，因此要求模型显式标高风险并给出理由或引用。
  if (plan.riskLevel !== 'high') return { ok: false, error: '删除节点必须标记为高风险' }

  const hasReference = plan.references.length > 0
  const hasDeleteReason = deleteOperations.some((operation) => operation.reason?.trim())
  const hasPlanRationale = plan.rationale.trim().length > 0
  if (!hasReference && !hasDeleteReason && !hasPlanRationale) {
    return { ok: false, error: '高风险删除缺少引用或理由' }
  }

  return { ok: true }
}
