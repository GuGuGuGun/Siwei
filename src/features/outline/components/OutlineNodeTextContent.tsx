import React from 'react'
import { OutlineInlineContent } from '../OutlineInlineContent'

interface OutlineNodeTextContentProps {
  text: string
  checked?: boolean
  isAgentDeleting: boolean
  isAgentMoving: boolean
  agentTextPreview?: string
}

export const OutlineNodeTextContent: React.FC<OutlineNodeTextContentProps> = ({
  text,
  checked,
  isAgentDeleting,
  isAgentMoving,
  agentTextPreview,
}) => {
  return (
    <div className="min-w-0">
      <div
        className={`truncate text-sm font-medium leading-relaxed select-none ${
          isAgentDeleting
            ? 'text-rose-700 line-through'
            : agentTextPreview
              ? 'text-zinc-400 line-through'
              : checked
                ? 'text-zinc-400 line-through'
                : 'text-zinc-800'
        }`}
      >
        {text ? (
          <OutlineInlineContent text={text} />
        ) : (
          <span className="font-normal italic text-zinc-400">空白织线</span>
        )}
      </div>
      {agentTextPreview && (
        <div className="truncate text-sm font-medium leading-relaxed text-emerald-700">
          {agentTextPreview}
        </div>
      )}
      {isAgentDeleting && (
        <div className="text-[10px] font-medium leading-4 text-rose-500">将删除</div>
      )}
      {isAgentMoving && (
        <div className="text-[10px] font-medium leading-4 text-sky-600">将移动</div>
      )}
    </div>
  )
}
