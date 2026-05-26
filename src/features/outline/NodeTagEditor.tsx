import React from 'react'
import { Plus, X } from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'

interface NodeTagEditorProps {
  nodeId: string
  tags?: string[]
}

export const NodeTagEditor: React.FC<NodeTagEditorProps> = ({ nodeId, tags = [] }) => {
  const addNodeTag = useDocumentStore((s) => s.addNodeTag)
  const removeNodeTag = useDocumentStore((s) => s.removeNodeTag)
  const setFilterTag = useDocumentStore((s) => s.setFilterTag)
  const [isEditing, setIsEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')

  const commit = () => {
    const value = draft.trim()
    if (value) {
      addNodeTag(nodeId, value)
    }
    setDraft('')
    setIsEditing(false)
  }

  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex max-w-24 items-center gap-1 rounded border border-amber-900/15 bg-[#EFECE3] px-1.5 py-0.5 text-[10px] font-medium text-amber-950"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setFilterTag(tag)
            }}
            className="truncate focus:outline-none"
            title={`筛选标签 ${tag}`}
          >
            #{tag}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              removeNodeTag(nodeId, tag)
            }}
            className="text-amber-950/45 hover:text-amber-950 focus:outline-none"
            title="移除标签"
          >
            <X size={10} />
          </button>
        </span>
      ))}

      {isEditing ? (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setDraft('')
              setIsEditing(false)
            }
          }}
          onClick={(event) => event.stopPropagation()}
          className="h-6 w-24 rounded border border-amber-900/20 bg-white/70 px-2 text-[11px] text-zinc-800 outline-none focus:border-amber-700/40"
          placeholder="标签"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsEditing(true)
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 opacity-0 transition hover:bg-[#EFECE3] hover:text-zinc-700 focus:outline-none group-hover:opacity-100"
          title="添加标签"
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  )
}
