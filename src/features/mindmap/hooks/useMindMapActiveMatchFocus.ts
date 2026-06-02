import React from 'react'
import type { Node, ReactFlowInstance } from 'reactflow'
import type { MindMapNodeData } from '../MindMapNode'
import { DEFAULT_MIND_MAP_NODE_WIDTH } from '../mindMapReorder'

interface MindMapActiveMatchFocusOptions {
  activeMatchNodeId: string | null
  nodes: Node<MindMapNodeData>[]
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance | null>
  selectNode: (nodeId: string | null) => void
}

export function useMindMapActiveMatchFocus({
  activeMatchNodeId,
  nodes,
  flowInstanceRef,
  selectNode,
}: MindMapActiveMatchFocusOptions): void {
  React.useEffect(() => {
    if (!activeMatchNodeId) return
    selectNode(activeMatchNodeId)
    const node = nodes.find((item) => item.id === activeMatchNodeId)
    if (node) {
      flowInstanceRef.current?.setCenter(
        node.position.x + (node.width ?? DEFAULT_MIND_MAP_NODE_WIDTH) / 2,
        node.position.y + (node.height ?? 44) / 2,
        { duration: 300, zoom: 1 },
      )
    }
  }, [activeMatchNodeId, flowInstanceRef, nodes, selectNode])
}
