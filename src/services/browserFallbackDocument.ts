import type { OutlineDocument, SearchResult } from '../types/document'

export type BrowserFallbackTask = {
  nodeId: string
  text: string
  checked: boolean
  path: string[]
  tags: string[]
}

export function createDemoDocument(now: () => number): OutlineDocument {
  const timestamp = now()

  return {
    id: 'demo-doc',
    title: '未命名文档',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    root: {
      id: 'demo-root',
      text: '未命名文档',
      createdAt: timestamp,
      updatedAt: timestamp,
      children: [
        {
          id: 'demo-node-1',
          text: '开始记录你的想法',
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [],
        },
      ],
    },
  }
}

export function searchNode(
  node: OutlineDocument['root'],
  query: string,
  path: string[],
  results: SearchResult[],
): void {
  const lowerQuery = query.toLowerCase()
  const findRanges = (value: string): Array<[number, number]> => {
    const lowerValue = value.toLowerCase()
    const ranges: Array<[number, number]> = []
    let offset = 0
    while (offset <= lowerValue.length) {
      const start = lowerValue.indexOf(lowerQuery, offset)
      if (start < 0) break
      const end = start + query.length
      ranges.push([start, end])
      offset = end
    }
    return ranges
  }

  const textMatches = findRanges(node.text)
  const noteMatches = node.note ? findRanges(node.note) : []
  const tagMatches = (node.tags ?? [])
    .map((tagValue) => ({
      source: 'tag' as const,
      value: tagValue,
      matchIndices: findRanges(tagValue),
    }))
    .filter((match) => match.matchIndices.length > 0)

  if (textMatches.length > 0 || noteMatches.length > 0 || tagMatches.length > 0) {
    const matches: SearchResult['matches'] = []
    const matchSources: SearchResult['matchSources'] = []

    if (textMatches.length > 0) {
      matchSources.push('text')
      matches.push({ source: 'text', value: node.text, matchIndices: textMatches })
    }
    if (noteMatches.length > 0) {
      matchSources.push('note')
      matches.push({ source: 'note', value: node.note ?? '', matchIndices: noteMatches })
    }
    if (tagMatches.length > 0) {
      matchSources.push('tag')
      matches.push(...tagMatches)
    }

    results.push({
      nodeId: node.id,
      text: node.text,
      path,
      matchIndices: textMatches,
      matchSources,
      matches,
    })
  }

  node.children.forEach((child) => searchNode(child, query, [...path, node.text], results))
}

export function countNodes(node: OutlineDocument['root']): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0)
}

export function collectTags(node: OutlineDocument['root']): string[] {
  const tags = new Set(node.tags ?? [])
  node.children.forEach((child) => collectTags(child).forEach((tag) => tags.add(tag)))
  return [...tags].sort()
}

export function collectTasks(
  node: OutlineDocument['root'],
  path: string[] = [],
): BrowserFallbackTask[] {
  const current = node.checked === undefined
    ? []
    : [{
        nodeId: node.id,
        text: node.text,
        checked: node.checked,
        path,
        tags: node.tags ?? [],
      }]
  return [
    ...current,
    ...node.children.flatMap((child) => collectTasks(child, [...path, node.text])),
  ]
}

export function updateNodeChecked(
  node: OutlineDocument['root'],
  nodeId: string,
  checked: boolean,
  now: () => number,
): boolean {
  if (node.id === nodeId) {
    node.checked = checked
    node.updatedAt = now()
    return true
  }
  return node.children.some((child) => updateNodeChecked(child, nodeId, checked, now))
}
