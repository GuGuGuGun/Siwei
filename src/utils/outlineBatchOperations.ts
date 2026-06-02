import type { OutlineNode } from '../types/document'
import {
  findPath,
  indentNodeAtPath,
  moveNodeDownAtPath,
  moveNodeUpAtPath,
  outdentNodeAtPath,
} from './tree'

export interface BatchOperationResult {
  root: OutlineNode
  changed: boolean
}

function comparePath(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? -1
    const rightValue = right[index] ?? -1
    if (leftValue !== rightValue) return leftValue - rightValue
  }
  return 0
}

function isPathPrefix(parent: number[], child: number[]): boolean {
  return parent.length < child.length && parent.every((value, index) => value === child[index])
}

function selectedPathsInOrder(root: OutlineNode, selectedNodeIds: string[]) {
  return selectedNodeIds
    .map((id) => ({ id, path: findPath(root, id) }))
    .filter((item): item is { id: string; path: number[] } => Boolean(item.path))
    .sort((left, right) => comparePath(left.path, right.path))
}

export function getTopLevelSelectedNodeIds(
  root: OutlineNode,
  selectedNodeIds: string[],
): string[] {
  const selected = selectedPathsInOrder(root, selectedNodeIds)

  return selected
    .filter((candidate) => {
      return !selected.some(
        (other) => other.id !== candidate.id && isPathPrefix(other.path, candidate.path),
      )
    })
    .map((item) => item.id)
}

function moveOne(root: OutlineNode, nodeId: string, direction: 'up' | 'down'): BatchOperationResult {
  const path = findPath(root, nodeId)
  if (!path) return { root, changed: false }

  const nextRoot = direction === 'up' ? moveNodeUpAtPath(root, path) : moveNodeDownAtPath(root, path)
  return { root: nextRoot, changed: nextRoot !== root }
}

export function moveSelectedNodes(
  root: OutlineNode,
  selectedNodeIds: string[],
  direction: 'up' | 'down',
): BatchOperationResult {
  const topIds = getTopLevelSelectedNodeIds(root, selectedNodeIds)
  const ordered = selectedPathsInOrder(root, topIds).map((item) => item.id)
  const ids = direction === 'up' ? ordered : [...ordered].reverse()
  let nextRoot = root
  let changed = false

  for (const id of ids) {
    const result = moveOne(nextRoot, id, direction)
    nextRoot = result.root
    changed ||= result.changed
  }

  return { root: nextRoot, changed }
}

export function indentSelectedNodes(
  root: OutlineNode,
  selectedNodeIds: string[],
): BatchOperationResult {
  const topIds = getTopLevelSelectedNodeIds(root, selectedNodeIds)
  const ordered = selectedPathsInOrder(root, topIds).map((item) => item.id)
  let nextRoot = root
  let changed = false

  for (const id of ordered) {
    const path = findPath(nextRoot, id)
    if (!path) continue
    const movedRoot = indentNodeAtPath(nextRoot, path)
    changed ||= movedRoot !== nextRoot
    nextRoot = movedRoot
  }

  return { root: nextRoot, changed }
}

export function outdentSelectedNodes(
  root: OutlineNode,
  selectedNodeIds: string[],
): BatchOperationResult {
  const topIds = getTopLevelSelectedNodeIds(root, selectedNodeIds)
  const ordered = selectedPathsInOrder(root, topIds).map((item) => item.id).reverse()
  let nextRoot = root
  let changed = false

  for (const id of ordered) {
    const path = findPath(nextRoot, id)
    if (!path) continue
    const movedRoot = outdentNodeAtPath(nextRoot, path)
    changed ||= movedRoot !== nextRoot
    nextRoot = movedRoot
  }

  return { root: nextRoot, changed }
}
