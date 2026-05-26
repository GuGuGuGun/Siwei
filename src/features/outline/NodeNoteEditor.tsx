import React from 'react'
import { FileText, X } from 'lucide-react'
import { useDocumentStore } from '../document/documentStore'

interface NodeNoteEditorProps {
  nodeId: string
  note?: string
}

export const NodeNoteEditor: React.FC<NodeNoteEditorProps> = ({ nodeId, note }) => {
  const updateNodeNote = useDocumentStore((s) => s.updateNodeNote)
  const [isOpen, setIsOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(note ?? '')

  React.useEffect(() => {
    if (!isOpen) {
      setDraft(note ?? '')
    }
  }, [isOpen, note])

  const commit = () => {
    updateNodeNote(nodeId, draft)
    setIsOpen(false)
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen(true)
        }}
        className={`flex h-6 w-6 items-center justify-center rounded-md border transition focus:outline-none ${
          note
            ? 'border-amber-700/35 bg-amber-100/70 text-amber-900'
            : 'border-transparent text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-[#EFECE3]'
        }`}
        title={note ? '编辑备注' : '添加备注'}
      >
        <FileText size={13} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-7 z-50 w-72 rounded-lg border border-amber-900/20 bg-[#FFFCF5] p-3 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700">节点备注</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none"
              title="关闭"
            >
              <X size={13} />
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(note ?? '')
                setIsOpen(false)
              }
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
            }}
            className="h-28 w-full resize-none rounded-md border border-amber-900/15 bg-white/70 p-2 text-sm text-zinc-800 outline-none focus:border-amber-700/40"
            placeholder="记录补充说明"
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
