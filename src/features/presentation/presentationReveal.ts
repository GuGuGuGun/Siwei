import type { OutlineNode } from '../../types/document'

export interface PresentationNodeMeta {
  depth: number
  childCount: number
}

export interface RevealProgress {
  currentDepth: number
  maxDepth: number
  currentStep: number
  totalSteps: number
  label: string
}

export function getMaxRevealDepth(root: OutlineNode): number {
  let maxDepth = 0

  const visit = (node: OutlineNode, depth: number) => {
    maxDepth = Math.max(maxDepth, depth)
    node.children.forEach((child) => visit(child, depth + 1))
  }

  visit(root, 0)
  return maxDepth
}

export function createRevealProgress(root: OutlineNode, revealDepth: number): RevealProgress {
  const maxDepth = getMaxRevealDepth(root)
  const currentDepth = Math.min(maxDepth, Math.max(0, revealDepth))
  const currentStep = currentDepth + 1
  const totalSteps = maxDepth + 1

  return {
    currentDepth,
    maxDepth,
    currentStep,
    totalSteps,
    label: `第 ${currentStep} / ${totalSteps} 层`,
  }
}

export function createVisibleNodeIdSet(root: OutlineNode, revealDepth: number): Set<string> {
  const visibleNodeIds = new Set<string>()

  const visit = (node: OutlineNode, depth: number) => {
    if (depth > revealDepth) return
    visibleNodeIds.add(node.id)
    node.children.forEach((child) => visit(child, depth + 1))
  }

  visit(root, 0)
  return visibleNodeIds
}

export function collectPresentationNodeMeta(root: OutlineNode): Map<string, PresentationNodeMeta> {
  const metaByNodeId = new Map<string, PresentationNodeMeta>()

  const visit = (node: OutlineNode, depth: number) => {
    metaByNodeId.set(node.id, {
      depth,
      childCount: node.children.length,
    })
    node.children.forEach((child) => visit(child, depth + 1))
  }

  visit(root, 0)
  return metaByNodeId
}
