import type { OutlineNode } from '../../types/document'

export function getNodeSubtree(root: OutlineNode, nodeId: string | null): OutlineNode | null {
  if (!nodeId || root.id === nodeId) return nodeId ? root : null

  for (const child of root.children) {
    const found = getNodeSubtree(child, nodeId)
    if (found) return found
  }

  return null
}

export function getNodeDepthMap(root: OutlineNode): Map<string, number> {
  const depths = new Map<string, number>()

  const visit = (node: OutlineNode, depth: number) => {
    depths.set(node.id, depth)
    node.children.forEach((child) => visit(child, depth + 1))
  }

  visit(root, 0)
  return depths
}

export function getAncestorIds(root: OutlineNode, nodeId: string): string[] {
  const visit = (node: OutlineNode, ancestors: string[]): string[] | null => {
    if (node.id === nodeId) return ancestors

    for (const child of node.children) {
      const found = visit(child, [...ancestors, node.id])
      if (found) return found
    }

    return null
  }

  return visit(root, []) ?? []
}

export function getParentIdMap(root: OutlineNode): Map<string, string | null> {
  const parents = new Map<string, string | null>()

  const visit = (node: OutlineNode, parentId: string | null) => {
    parents.set(node.id, parentId)
    node.children.forEach((child) => visit(child, node.id))
  }

  visit(root, null)
  return parents
}

export function getChildIndexMap(root: OutlineNode): Map<string, number> {
  const indexes = new Map<string, number>()

  const visit = (node: OutlineNode) => {
    node.children.forEach((child, index) => {
      indexes.set(child.id, index)
      visit(child)
    })
  }

  visit(root)
  return indexes
}

export function getDescendantIds(root: OutlineNode, nodeId: string): Set<string> {
  const descendantIds = new Set<string>()
  const node = getNodeSubtree(root, nodeId)
  if (!node) return descendantIds

  const collect = (children: OutlineNode[]) => {
    children.forEach((child) => {
      descendantIds.add(child.id)
      collect(child.children)
    })
  }

  collect(node.children)
  return descendantIds
}

export function getVisibleMindMapNodeIds(
  root: OutlineNode,
  collapsedNodeIds: Set<string>,
  focusRootNodeId: string | null,
): string[] {
  const startNode = focusRootNodeId && focusRootNodeId !== root.id
    ? getNodeSubtree(root, focusRootNodeId)
    : root
  if (!startNode) return []

  const ids: string[] = []
  const visit = (node: OutlineNode) => {
    ids.push(node.id)
    if (node.collapsed || collapsedNodeIds.has(node.id)) return
    node.children.forEach(visit)
  }

  visit(startNode)
  return ids
}

export function searchOutlineNodes(
  root: OutlineNode,
  query: string,
  visibleNodeIds: Set<string>,
): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const matches: string[] = []
  const visit = (node: OutlineNode) => {
    const haystacks = [
      node.text,
      node.note ?? '',
      ...(node.tags ?? []),
    ].map((value) => value.toLowerCase())

    if (visibleNodeIds.has(node.id) && haystacks.some((value) => value.includes(normalized))) {
      matches.push(node.id)
    }

    node.children.forEach(visit)
  }

  visit(root)
  return matches
}

export function clampSearchIndex(index: number, length: number): number {
  if (length <= 0) return -1
  return ((index % length) + length) % length
}
