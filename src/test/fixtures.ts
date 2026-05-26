import type { OutlineDocument, OutlineNode } from '../types/document'

export function createNode(
  id: string,
  text: string,
  children: OutlineNode[] = [],
): OutlineNode {
  return {
    id,
    text,
    createdAt: 1,
    updatedAt: 1,
    children,
  }
}

export function createDocument(): OutlineDocument {
  return {
    id: 'doc-1',
    title: '测试文档',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    root: createNode('root', '测试文档', [
      createNode('node-1', '第一节点', [
        createNode('node-1-1', '第一子节点'),
      ]),
      createNode('node-2', '第二节点'),
    ]),
  }
}
