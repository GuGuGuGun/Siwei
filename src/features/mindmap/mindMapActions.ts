import { OutlineNode } from '../../types/document'

export interface MindMapMenuItem {
  key: string
  label: string
  disabled: boolean
  danger?: boolean
}

export function findNodeById(root: OutlineNode, nodeId: string): OutlineNode | null {
  if (root.id === nodeId) return root

  for (const child of root.children) {
    const found = findNodeById(child, nodeId)
    if (found) return found
  }

  return null
}

export function countDescendants(node: OutlineNode): number {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0)
}

export function formatDeleteConfirmation(node: OutlineNode): string {
  const descendantCount = countDescendants(node)
  return `确定删除「${node.text || '空白节点'}」及其 ${descendantCount} 个子节点吗？`
}
