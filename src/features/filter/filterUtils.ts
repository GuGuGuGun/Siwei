import type { OutlineNode } from '../../types/document'

export type CheckedFilter = 'all' | 'checked' | 'unchecked' | 'task'

export interface OutlineFilterState {
  query: string
  tag: string | null
  checked: CheckedFilter
}

export interface TagSummary {
  tag: string
  count: number
  nodeIds: string[]
}

export interface TaskSummary {
  nodeId: string
  text: string
  checked: boolean
  path: string[]
  tags: string[]
}

export interface VisibleTreeNode {
  node: OutlineNode
  depth: number
  path: number[]
  parentId: string | null
}

export interface VisibleTreeResult {
  nodes: VisibleTreeNode[]
  matchingNodeIds: Set<string>
}

export function isValidTag(tag: string): boolean {
  const trimmed = tag.trim()
  return (
    trimmed.length > 0 &&
    !trimmed.includes('#') &&
    !trimmed.includes('\r') &&
    !trimmed.includes('\n') &&
    !/\s/.test(trimmed)
  )
}

export function normalizeTag(tag: string): string | null {
  const trimmed = tag.trim()
  return isValidTag(trimmed) ? trimmed : null
}

export function normalizeTagList(tags: string[]): string[] | undefined {
  const seen = new Set<string>()
  const normalized = tags
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => Boolean(tag))
    .filter((tag) => {
      if (seen.has(tag)) return false
      seen.add(tag)
      return true
    })

  return normalized.length > 0 ? normalized : undefined
}

export function collectTags(root: OutlineNode): TagSummary[] {
  const byTag = new Map<string, TagSummary>()

  walkNodes(root, (node) => {
    for (const tag of normalizeTagList(node.tags ?? []) ?? []) {
      const summary = byTag.get(tag)
      if (summary) {
        summary.count += 1
        summary.nodeIds.push(node.id)
      } else {
        byTag.set(tag, { tag, count: 1, nodeIds: [node.id] })
      }
    }
  })

  return [...byTag.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    return left.tag.localeCompare(right.tag, 'zh-Hans-CN')
  })
}

export function collectTasks(root: OutlineNode): TaskSummary[] {
  const tasks: TaskSummary[] = []

  const traverse = (node: OutlineNode, path: string[], isRoot: boolean) => {
    if (!isRoot && node.checked !== undefined) {
      tasks.push({
        nodeId: node.id,
        text: node.text,
        checked: node.checked,
        path,
        tags: normalizeTagList(node.tags ?? []) ?? [],
      })
    }

    for (const child of node.children) {
      traverse(child, isRoot ? [] : [...path, node.text], false)
    }
  }

  traverse(root, [], true)
  return tasks
}

export function filterVisibleTree(
  root: OutlineNode,
  collapsedNodeIds: Set<string> = new Set(),
  filter: OutlineFilterState = { query: '', tag: null, checked: 'all' },
): VisibleTreeResult {
  const nodes: VisibleTreeNode[] = []
  const matchingNodeIds = new Set<string>()
  const normalizedQuery = filter.query.trim().toLowerCase()

  const matchesFilter = (node: OutlineNode) => {
    const queryMatches =
      normalizedQuery.length === 0 ||
      node.text.toLowerCase().includes(normalizedQuery) ||
      (node.note ?? '').toLowerCase().includes(normalizedQuery) ||
      (node.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedQuery))

    const tagMatches = !filter.tag || (node.tags ?? []).includes(filter.tag)
    const checkedMatches =
      filter.checked === 'all' ||
      (filter.checked === 'checked' && node.checked === true) ||
      (filter.checked === 'unchecked' && node.checked === false) ||
      (filter.checked === 'task' && node.checked !== undefined)

    return queryMatches && tagMatches && checkedMatches
  }

  const traverse = (
    node: OutlineNode,
    depth: number,
    indexPath: number[],
    parentId: string | null,
  ): boolean => {
    const selfMatches = depth >= 0 && matchesFilter(node)
    if (selfMatches) matchingNodeIds.add(node.id)

    const isCollapsed = depth >= 0 && (node.collapsed || collapsedNodeIds.has(node.id))
    const childMatches = node.children
      .map((child, index) => {
        if (isCollapsed) return false
        return traverse(child, depth + 1, [...indexPath, index], depth >= 0 ? node.id : null)
      })
      .some(Boolean)

    const shouldShow = selfMatches || childMatches
    if (shouldShow && depth >= 0) {
      nodes.push({ node, depth, path: indexPath, parentId })
    }

    return shouldShow
  }

  traverse(root, -1, [], null)

  return {
    nodes: nodes.sort(compareTreePath),
    matchingNodeIds,
  }
}

export function findNodePath(root: OutlineNode, targetId: string): OutlineNode[] | null {
  const path: OutlineNode[] = []

  const traverse = (node: OutlineNode): boolean => {
    path.push(node)
    if (node.id === targetId) return true

    for (const child of node.children) {
      if (traverse(child)) return true
    }

    path.pop()
    return false
  }

  return traverse(root) ? path : null
}

export function countTagUsage(root: OutlineNode, tag: string): number {
  let count = 0
  walkNodes(root, (node) => {
    if ((node.tags ?? []).includes(tag)) count += 1
  })
  return count
}

function walkNodes(node: OutlineNode, visitor: (node: OutlineNode) => void) {
  visitor(node)
  node.children.forEach((child) => walkNodes(child, visitor))
}

function compareTreePath(left: VisibleTreeNode, right: VisibleTreeNode) {
  const maxLength = Math.max(left.path.length, right.path.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left.path[index] ?? -1
    const rightValue = right.path[index] ?? -1
    if (leftValue !== rightValue) return leftValue - rightValue
  }
  return 0
}
