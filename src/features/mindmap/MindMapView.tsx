import React from 'react'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Node,
  NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useDocumentStore } from '../document/documentStore'
import { outlineToGraph } from './outlineToGraph'
import { layoutGraph } from './layoutGraph'
import { FileText } from 'lucide-react'

// Custom Fabric Patch Node Component
const CustomMindMapNode: React.FC<NodeProps> = ({ id, data, selected, type }) => {
  const isRoot = type === 'input'
  
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 min-w-[150px] max-w-[220px] text-center select-none shadow-fabric relative ${
        selected
          ? 'border-dashed border-amber-600 bg-[#FCFAF0] scale-[1.03] ring-4 ring-amber-600/5'
          : 'border-dashed border-amber-900/20 bg-[#FAF6EC] hover:border-amber-900/40 hover:bg-[#FAF5E6]'
      }`}
    >
      {/* Target input handle (on left) for non-root nodes */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#A27B5C', border: 'none', width: 6, height: 6 }}
        />
      )}

      <div className="text-xs font-semibold leading-relaxed text-zinc-800 break-words">
        {data.label || <span className="text-zinc-400 italic font-normal">空白织物</span>}
      </div>

      {/* Source output handle (on right) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#A27B5C', border: 'none', width: 6, height: 6 }}
      />
    </div>
  )
}

const nodeTypes = {
  custom: CustomMindMapNode,
  input: CustomMindMapNode,
}

export const MindMapView: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const collapsedNodeIds = useDocumentStore((s) => s.collapsedNodeIds)
  const selectedNodeId = useDocumentStore((s) => s.selectedNodeId)
  const selectNode = useDocumentStore((s) => s.selectNode)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Re-compute graph when doc, collapse status, or selection changes
  React.useEffect(() => {
    if (!currentDoc) return

    const rawGraph = outlineToGraph(currentDoc.root, collapsedNodeIds)

    const graphWithSelection = {
      ...rawGraph,
      nodes: rawGraph.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    }

    const layouted = layoutGraph(graphWithSelection)

    setNodes(layouted.nodes)
    setEdges(layouted.edges)
  }, [currentDoc, collapsedNodeIds, selectedNodeId])

  if (!currentDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-zinc-400 bg-linen">
        <FileText size={42} className="text-zinc-300 mb-3" />
        <p className="text-xs font-semibold font-mono tracking-wider">请选择一个织物卡以查看导图</p>
      </div>
    )
  }

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    selectNode(node.id)
  }

  const handlePaneClick = () => {
    selectNode(null)
  }

  return (
    <div className="h-full w-full bg-linen relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        className="text-zinc-700"
      >
        <Controls className="!bg-[#FAF8F4] !border-amber-900/10 !shadow-fabric [&>button]:!border-amber-900/5 [&>button]:hover:!bg-[#EFECE3]" />
        <MiniMap
          style={{ background: '#FAF8F4', border: '1px dashed rgba(139, 90, 43, 0.2)', borderRadius: '12px' }}
          nodeColor="#FAF6EC"
          maskColor="rgba(240, 235, 220, 0.4)"
          className="!bottom-4 !right-4"
        />
        {/* Subtle grid points in warm gold-brown */}
        <Background color="#FAF8F4" gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}
