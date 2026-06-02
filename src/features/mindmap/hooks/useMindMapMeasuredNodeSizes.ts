import React from 'react'
import type { Node } from 'reactflow'
import type { MindMapLayoutDiagnostics, MindMapNodeSize } from '../layoutEngine'
import type { MindMapNodeData } from '../MindMapNode'
import type { MindMapMode } from '../MindMapToolbar'

export function useMindMapMeasuredNodeSizes(
  mode: MindMapMode,
  nodes: Node<MindMapNodeData>[],
) {
  const measuredNodeSizes = React.useMemo(() => {
    if (mode === 'reorganize') return {}

    return nodes.reduce<Record<string, MindMapNodeSize>>((sizes, node) => {
      if (typeof node.width === 'number' && typeof node.height === 'number') {
        sizes[node.id] = { width: node.width, height: node.height }
      }
      return sizes
    }, {})
  }, [mode, nodes])

  const measuredNodeSizeSignature = React.useMemo(() => {
    return Object.entries(measuredNodeSizes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, size]) => `${nodeId}:${size.width}x${size.height}`)
      .join('|')
  }, [measuredNodeSizes])

  return {
    measuredNodeSizes,
    measuredNodeSizeSignature,
  }
}

export type { MindMapLayoutDiagnostics, MindMapNodeSize }
