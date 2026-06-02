import type { OutlineNode } from '../../types/document'
import type { AgentInsertedNode, AgentMindMapNodeInput } from './agentTypes'

type AgentNodeInput = AgentInsertedNode | AgentMindMapNodeInput

interface CreateOutlineNodeOptions<TInput extends AgentNodeInput> {
  now: number
  createId: (input: TInput) => string
}

type CreateOutlineNodeResult =
  | { ok: true; node: OutlineNode }
  | { ok: false; error: 'empty-title' }

export function normalizeAgentOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function normalizeAgentTags(tags: string[]): string[] | undefined {
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort()
  return normalized.length > 0 ? normalized : undefined
}

export function createOutlineNodeFromAgentInput<TInput extends AgentNodeInput>(
  input: TInput,
  options: CreateOutlineNodeOptions<TInput>,
): CreateOutlineNodeResult {
  const text = input.text.trim()
  if (!text) return { ok: false, error: 'empty-title' }

  const children: OutlineNode[] = []
  for (const child of input.children ?? []) {
    const childResult = createOutlineNodeFromAgentInput(child as TInput, options)
    if (!childResult.ok) return childResult
    children.push(childResult.node)
  }

  return {
    ok: true,
    node: {
      id: options.createId(input),
      text,
      note: normalizeAgentOptionalText(input.note),
      checked: input.checked ?? undefined,
      tags: normalizeAgentTags(input.tags ?? []),
      createdAt: options.now,
      updatedAt: options.now,
      children,
    },
  }
}
