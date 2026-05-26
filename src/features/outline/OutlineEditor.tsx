import React from 'react'
import { useDocumentStore } from '../document/documentStore'
import { OutlineNodeItem } from './OutlineNodeItem'
import { getVisibleNodes } from '../../utils/tree'
import { FileText, Plus } from 'lucide-react'

export const OutlineEditor: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const selectedNodeId = useDocumentStore((s) => s.selectedNodeId)
  const collapsedNodeIds = useDocumentStore((s) => s.collapsedNodeIds)
  
  const selectNode = useDocumentStore((s) => s.selectNode)
  const updateNodeText = useDocumentStore((s) => s.updateNodeText)
  const insertNode = useDocumentStore((s) => s.insertNode)
  const beginTextEditSession = useDocumentStore((s) => s.beginTextEditSession)
  const commitTextEditSession = useDocumentStore((s) => s.commitTextEditSession)

  const visibleNodes = React.useMemo(() => {
    if (!currentDoc) return []
    return getVisibleNodes(currentDoc.root, collapsedNodeIds)
  }, [currentDoc, collapsedNodeIds])

  const handleNavigate = (nodeId: string, direction: 'up' | 'down') => {
    const index = visibleNodes.findIndex((n) => n.node.id === nodeId)
    if (index === -1) return

    if (direction === 'up' && index > 0) {
      selectNode(visibleNodes[index - 1].node.id)
    } else if (direction === 'down' && index < visibleNodes.length - 1) {
      selectNode(visibleNodes[index + 1].node.id)
    }
  }

  if (!currentDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-zinc-400 bg-linen">
        <FileText size={42} className="text-zinc-300 mb-3" />
        <p className="text-xs font-semibold font-mono tracking-wider">请选择一个织物卡进行编辑</p>
      </div>
    )
  }

  const handleEmptyClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (visibleNodes.length > 0) {
        selectNode(visibleNodes[visibleNodes.length - 1].node.id)
      } else {
        insertNode(currentDoc.root.id)
      }
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-linen px-12 py-8 overflow-y-auto select-text cursor-text relative"
      onClick={handleEmptyClick}
    >
      {/* Title Header: Stitched Fabric Tag look */}
      <div className="mb-8 border-b border-dashed border-amber-900/20 pb-4 shrink-0">
        <input
          type="text"
          value={currentDoc.title || ''}
          onFocus={() => beginTextEditSession(currentDoc.root.id)}
          onBlur={() => commitTextEditSession(currentDoc.root.id)}
          onChange={(e) => updateNodeText(currentDoc.root.id, e.target.value)}
          className="w-full bg-transparent text-2xl font-bold text-zinc-900 outline-none border-none p-0 focus:ring-0 placeholder-zinc-300 tracking-wide font-sans"
          placeholder="未命名织物"
        />
      </div>

      {/* Visible Node List */}
      <div className="flex-1 flex flex-col gap-1 pb-40">
        {visibleNodes.map((item) => (
          <OutlineNodeItem
            key={item.node.id}
            node={item.node}
            depth={item.depth}
            path={item.path}
            parentId={item.parentId}
            isSelected={selectedNodeId === item.node.id}
            isCollapsed={collapsedNodeIds.has(item.node.id)}
            onNavigate={(dir) => handleNavigate(item.node.id, dir)}
          />
        ))}

        {visibleNodes.length === 0 && (
          <div
            onClick={() => insertNode(currentDoc.root.id)}
            className="flex items-center gap-2 border border-dashed border-amber-900/30 rounded-xl p-5 text-zinc-400 hover:border-amber-900/50 hover:text-zinc-600 transition cursor-pointer justify-center my-6 select-none bg-[#FAF9F5]/40"
          >
            <Plus size={14} />
            <span className="text-xs font-semibold font-mono tracking-wider">点击缝入第一个节点</span>
          </div>
        )}
      </div>
    </div>
  )
}
