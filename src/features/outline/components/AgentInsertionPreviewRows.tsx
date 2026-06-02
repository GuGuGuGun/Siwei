import React from 'react'
import type { AgentInsertionPreview } from '../../agent/agentTypes'

interface AgentInsertionPreviewRowsProps {
  depth: number
  parentNodeId: string
  insertions: AgentInsertionPreview[]
}

export const AgentInsertionPreviewRows: React.FC<AgentInsertionPreviewRowsProps> = ({
  depth,
  parentNodeId,
  insertions,
}) => {
  return (
    <>
      {insertions.map((insertion) => (
        <div
          key={insertion.node.id}
          data-agent-insertion-parent-id={parentNodeId}
          className="ml-8 flex h-8 items-center rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 px-3 text-sm font-medium text-emerald-700"
          style={{ marginLeft: `${(depth + 1) * 24 + 28}px` }}
        >
          <span className="mr-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            将插入
          </span>
          <span className="truncate">{insertion.node.text || '空白节点'}</span>
        </div>
      ))}
    </>
  )
}
