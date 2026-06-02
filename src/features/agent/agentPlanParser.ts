import type { OutlineDocument } from '../../types/document'
import type { AgentChangePlan } from './agentTypes'
import { normalizeLegacyChangePlan, normalizeLegacyConcatenatedObjects } from './agentLegacyPlanParser'
import { isRecord } from './agentParserUtils'
import { normalizeStrictChangePlan } from './agentStrictPlanParser'

export type AgentResponseParseResult =
  | { kind: 'plan'; plan: AgentChangePlan; legacy: boolean }
  | { kind: 'message'; text: string; warning?: string }

export function parseAgentResponseText(
  text: string,
  currentDoc: OutlineDocument | null,
): AgentResponseParseResult {
  const strippedText = stripJsonFence(text.trim())
  const jsonText = extractJsonObject(strippedText)
  if (!jsonText) return { kind: 'message', text }

  // 先走严格协议，只有完整 JSON 对象不满足新 schema 时才降级到旧模型兼容路径。
  if (isBalancedJsonObjectText(jsonText)) {
    const parsed = JSON.parse(jsonText)
    const strictPlan = normalizeStrictChangePlan(parsed)
    if (strictPlan) return { kind: 'plan', plan: strictPlan, legacy: false }

    if (isRecord(parsed) && parsed.schemaVersion !== undefined) {
      return { kind: 'message', text, warning: '未生成可应用修改' }
    }

    const legacyPlan = currentDoc ? normalizeLegacyChangePlan(parsed, currentDoc) : null
    if (legacyPlan) return { kind: 'plan', plan: legacyPlan, legacy: true }
  }

  const legacyPlan = currentDoc
    ? normalizeLegacyConcatenatedObjects(jsonText, currentDoc)
    : null
  if (legacyPlan) return { kind: 'plan', plan: legacyPlan, legacy: true }

  return { kind: 'message', text, warning: '未生成可应用修改' }
}

export function looksLikeStructuredAgentOutput(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('{')
    || trimmed.startsWith('```json')
    || trimmed.startsWith('```')
    || trimmed.startsWith('"documentId')
    || trimmed.startsWith('documentId')
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return text.slice(start, end + 1)
}

function isBalancedJsonObjectText(text: string): boolean {
  let depth = 0
  let inString = false
  let escaped = false

  // 只有单个完整对象才允许 JSON.parse；混杂解释文本或拼接对象会进入兼容解析。
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && index !== text.length - 1) return false
      if (depth < 0) return false
    }
  }

  return depth === 0 && !inString
}
