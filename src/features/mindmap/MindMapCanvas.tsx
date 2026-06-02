import React from 'react'
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeDragHandler,
  OnEdgesChange,
  OnNodesChange,
  ReactFlowInstance,
} from 'reactflow'

import { MindMapNode, type MindMapNodeData } from './MindMapNode'

const nodeTypes = {
  custom: MindMapNode,
  root: MindMapNode,
}

interface MindMapCanvasProps {
  nodes: Node<MindMapNodeData>[]
  edges: Edge[]
  nodesDraggable: boolean
  onNodeClick: (event: React.MouseEvent, node: Node) => void
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void
  onPaneClick: () => void
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onNodeDrag: NodeDragHandler
  onNodeDragStop: NodeDragHandler
  onKeyDown: React.KeyboardEventHandler
  onInit: (instance: ReactFlowInstance) => void
}

export const MindMapCanvas = React.forwardRef<HTMLDivElement, MindMapCanvasProps>(({
  nodes,
  edges,
  nodesDraggable,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onPaneClick,
  onNodesChange,
  onEdgesChange,
  onNodeDrag,
  onNodeDragStop,
  onKeyDown,
  onInit,
}, ref) => {
  return (
    <div ref={ref} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onKeyDown={onKeyDown}
        onInit={onInit}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={nodesDraggable}
        nodesConnectable={false}
        elementsSelectable
        className="text-zinc-700"
      >
        <Controls className="!bg-[#FAF8F4] !border-amber-900/10 !shadow-fabric [&>button]:!border-amber-900/5 [&>button]:hover:!bg-[#EFECE3]" />
        <MiniMap
          style={{
            width: 132,
            height: 92,
            background: 'rgba(250, 248, 244, 0.72)',
            border: '1px dashed rgba(139, 90, 43, 0.16)',
            borderRadius: '10px',
            boxShadow: '0 8px 22px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}
          position="bottom-right"
          nodeColor="#FAF6EC"
          nodeStrokeColor="rgba(139, 90, 43, 0.18)"
          nodeStrokeWidth={1}
          nodeBorderRadius={6}
          maskColor="rgba(240, 235, 220, 0.24)"
          maskStrokeColor="rgba(139, 90, 43, 0.08)"
          className="siwei-mindmap-minimap opacity-60 transition-opacity hover:opacity-95"
        />
        <Background color="#FAF8F4" gap={16} size={1} />
      </ReactFlow>
    </div>
  )
})

MindMapCanvas.displayName = 'MindMapCanvas'
