import { OutlineNode } from '../types/document'

interface TreeFilterState {
  tag: string | null
  checked: 'all' | 'checked' | 'unchecked' | 'task'
}

/**
 * Finds the index path (e.g. [1, 0, 2]) to the node with the target ID.
 * Returns null if not found.
 */
export function findPath(root: OutlineNode, targetId: string, currentPath: number[] = []): number[] | null {
  if (root.id === targetId) return currentPath;
  for (let i = 0; i < root.children.length; i++) {
    const path = findPath(root.children[i], targetId, [...currentPath, i]);
    if (path) return path;
  }
  return null;
}

/**
 * Recursively updates a node at the specified path using an updater function.
 * Returns a new tree.
 */
export function updateNodeAtPath(
  root: OutlineNode,
  path: number[],
  updater: (node: OutlineNode) => OutlineNode
): OutlineNode {
  if (path.length === 0) {
    return updater(root);
  }
  const [nextIndex, ...rest] = path;
  const newChildren = [...root.children];
  if (newChildren[nextIndex]) {
    newChildren[nextIndex] = updateNodeAtPath(newChildren[nextIndex], rest, updater);
  }
  return { ...root, children: newChildren };
}

/**
 * Inserts a new node immediately after the node at the specified path.
 * Returns a new tree.
 */
export function insertSiblingAtPath(
  root: OutlineNode,
  path: number[],
  newNode: OutlineNode
): OutlineNode {
  if (path.length === 0) {
    // Cannot insert sibling to root node
    return root;
  }
  const parentPath = path.slice(0, -1);
  const targetIndex = path[path.length - 1];

  return updateNodeAtPath(root, parentPath, (parent) => {
    const newChildren = [...parent.children];
    newChildren.splice(targetIndex + 1, 0, newNode);
    return { ...parent, children: newChildren };
  });
}

/**
 * Inserts a new node as the last child of the node at the specified path.
 * Returns a new tree.
 */
export function insertChildAtPath(
  root: OutlineNode,
  path: number[],
  newNode: OutlineNode
): OutlineNode {
  return updateNodeAtPath(root, path, (parent) => ({
    ...parent,
    children: [...parent.children, newNode],
  }));
}

/**
 * Deletes the node at the specified path.
 * Returns a new tree.
 */
export function deleteNodeAtPath(
  root: OutlineNode,
  path: number[]
): OutlineNode {
  if (path.length === 0) {
    // Cannot delete root node
    return root;
  }
  const parentPath = path.slice(0, -1);
  const targetIndex = path[path.length - 1];

  return updateNodeAtPath(root, parentPath, (parent) => {
    const newChildren = [...parent.children];
    newChildren.splice(targetIndex, 1);
    return { ...parent, children: newChildren };
  });
}

/**
 * Moves the node at the specified path to be a child of its previous sibling.
 * Returns a new tree.
 */
export function indentNodeAtPath(
  root: OutlineNode,
  path: number[]
): OutlineNode {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const targetIndex = path[path.length - 1];
  if (targetIndex === 0) return root; // No previous sibling to indent into

  let nodeToMove: OutlineNode | null = null;
  const rootWithDeleted = updateNodeAtPath(root, parentPath, (parent) => {
    const newChildren = [...parent.children];
    nodeToMove = newChildren[targetIndex];
    newChildren.splice(targetIndex, 1);
    return { ...parent, children: newChildren };
  });

  if (!nodeToMove) return root;

  // Sibling is now at targetIndex - 1
  const previousSiblingPath = [...parentPath, targetIndex - 1];

  return updateNodeAtPath(rootWithDeleted, previousSiblingPath, (prevSibling) => {
    const newChildren = [...prevSibling.children, { ...nodeToMove!, collapsed: false }];
    return { ...prevSibling, children: newChildren };
  });
}

/**
 * Moves the node at the specified path to be a sibling of its parent (inserted right after the parent).
 * Returns a new tree.
 */
export function outdentNodeAtPath(
  root: OutlineNode,
  path: number[]
): OutlineNode {
  if (path.length <= 1) return root; // Cannot outdent if parent is root

  const parentPath = path.slice(0, -1);
  const targetIndex = path[path.length - 1];
  const grandparentPath = parentPath.slice(0, -1);
  const parentIndexInGrandparent = parentPath[parentPath.length - 1];

  let nodeToMove: OutlineNode | null = null;
  const rootWithDeleted = updateNodeAtPath(root, parentPath, (parent) => {
    const newChildren = [...parent.children];
    nodeToMove = newChildren[targetIndex];
    newChildren.splice(targetIndex, 1);
    return { ...parent, children: newChildren };
  });

  if (!nodeToMove) return root;

  return updateNodeAtPath(rootWithDeleted, grandparentPath, (grandparent) => {
    const newChildren = [...grandparent.children];
    newChildren.splice(parentIndexInGrandparent + 1, 0, nodeToMove!);
    return { ...grandparent, children: newChildren };
  });
}

/**
 * Moves the node at the specified path up (swaps with previous sibling).
 * Returns a new tree.
 */
export function moveNodeUpAtPath(
  root: OutlineNode,
  path: number[]
): OutlineNode {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const targetIndex = path[path.length - 1];
  if (targetIndex === 0) return root; // Already first sibling

  return updateNodeAtPath(root, parentPath, (parent) => {
    const newChildren = [...parent.children];
    const temp = newChildren[targetIndex];
    newChildren[targetIndex] = newChildren[targetIndex - 1];
    newChildren[targetIndex - 1] = temp;
    return { ...parent, children: newChildren };
  });
}

/**
 * Moves the node at the specified path down (swaps with next sibling).
 * Returns a new tree.
 */
export function moveNodeDownAtPath(
  root: OutlineNode,
  path: number[]
): OutlineNode {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const targetIndex = path[path.length - 1];

  return updateNodeAtPath(root, parentPath, (parent) => {
    if (targetIndex >= parent.children.length - 1) return parent; // Already last sibling
    const newChildren = [...parent.children];
    const temp = newChildren[targetIndex];
    newChildren[targetIndex] = newChildren[targetIndex + 1];
    newChildren[targetIndex + 1] = temp;
    return { ...parent, children: newChildren };
  });
}

/**
 * Moves a node before another sibling in the same parent.
 * Returns the original tree when paths are invalid or cross different parents.
 */
export function moveNodeToSiblingIndexAtPath(
  root: OutlineNode,
  sourcePath: number[],
  targetPath: number[]
): OutlineNode {
  if (sourcePath.length === 0 || targetPath.length === 0) return root;

  const sourceParentPath = sourcePath.slice(0, -1);
  const targetParentPath = targetPath.slice(0, -1);
  const isSameParent =
    sourceParentPath.length === targetParentPath.length &&
    sourceParentPath.every((value, index) => value === targetParentPath[index]);

  if (!isSameParent) return root;

  const sourceIndex = sourcePath[sourcePath.length - 1];
  const targetIndex = targetPath[targetPath.length - 1];
  if (sourceIndex === targetIndex) return root;

  return updateNodeAtPath(root, sourceParentPath, (parent) => {
    if (
      sourceIndex < 0 ||
      sourceIndex >= parent.children.length ||
      targetIndex < 0 ||
      targetIndex >= parent.children.length
    ) {
      return parent;
    }

    const newChildren = [...parent.children];
    const [nodeToMove] = newChildren.splice(sourceIndex, 1);
    newChildren.splice(targetIndex, 0, nodeToMove);
    return { ...parent, children: newChildren };
  });
}

export interface VisibleNodeInfo {
  node: OutlineNode;
  depth: number;
  path: number[];
  parentId: string | null;
}

/**
 * Traverses the document tree recursively and flattens all visible nodes (descendants of root).
 * Takes collapsed nodes into account.
 */
export function getVisibleNodes(
  root: OutlineNode,
  collapsedNodeIds: Set<string> = new Set(),
  filter: TreeFilterState = { tag: null, checked: 'all' },
): VisibleNodeInfo[] {
  const list: VisibleNodeInfo[] = [];

  const matchesFilter = (node: OutlineNode) => {
    const tagMatches = !filter.tag || (node.tags ?? []).includes(filter.tag)
    const checkedMatches =
      filter.checked === 'all' ||
      (filter.checked === 'checked' && node.checked === true) ||
      (filter.checked === 'unchecked' && node.checked === false) ||
      (filter.checked === 'task' && node.checked !== undefined)

    return tagMatches && checkedMatches
  }

  const traverse = (node: OutlineNode, depth: number, path: number[], parentId: string | null): boolean => {
    const isCollapsed = depth >= 0 && (node.collapsed || collapsedNodeIds.has(node.id))
    const childMatches = node.children
      .map((child, index) => {
        if (isCollapsed) return false
        return traverse(child, depth + 1, [...path, index], depth >= 0 ? node.id : null)
      })
      .some(Boolean)

    const selfMatches = depth >= 0 && matchesFilter(node)
    const shouldShow = selfMatches || childMatches

    if (shouldShow && depth >= 0) {
      list.push({ node, depth, path, parentId });
    }

    return shouldShow
  };

  traverse(root, -1, [], null);
  return list.sort((left, right) => {
    const maxLength = Math.max(left.path.length, right.path.length)
    for (let index = 0; index < maxLength; index += 1) {
      const leftValue = left.path[index] ?? -1
      const rightValue = right.path[index] ?? -1
      if (leftValue !== rightValue) return leftValue - rightValue
    }
    return 0
  });
}
