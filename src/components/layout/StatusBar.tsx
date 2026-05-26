import React from 'react'
import { useDocumentStore } from '../../features/document/documentStore'
import { OutlineNode } from '../../types/document'
import { CheckCircle, RefreshCw, AlertCircle } from 'lucide-react'

export const StatusBar: React.FC = () => {
  const currentDoc = useDocumentStore((s) => s.currentDoc)
  const currentFilePath = useDocumentStore((s) => s.currentFilePath)
  const isDirty = useDocumentStore((s) => s.isDirty)
  const saveStatus = useDocumentStore((s) => s.saveStatus)

  // Recursive counts helper
  const countStats = React.useMemo(() => {
    if (!currentDoc) return { nodes: 0, chars: 0 }

    const count = (node: OutlineNode): { nodes: number; chars: number } => {
      let nodes = 1
      let chars = node.text ? node.text.length : 0
      for (const child of node.children) {
        const c = count(child)
        nodes += c.nodes
        chars += c.chars
      }
      return { nodes, chars }
    }

    return count(currentDoc.root)
  }, [currentDoc])

  const statusIndicator = React.useMemo(() => {
    if (saveStatus === 'saving') {
      return (
        <span className="flex items-center gap-1 text-amber-700 font-semibold font-mono text-[10px] animate-pulse">
          <RefreshCw size={11} className="animate-spin" />
          正在自动缝合...
        </span>
      )
    }
    if (saveStatus === 'error') {
      return (
        <span className="flex items-center gap-1 text-rose-600 font-semibold font-mono text-[10px]">
          <AlertCircle size={11} />
          缝合保存失败
        </span>
      )
    }
    if (saveStatus === 'saved') {
      return (
        <span className="flex items-center gap-1 text-emerald-700 font-semibold font-mono text-[10px]">
          <CheckCircle size={11} />
          缝合成功
        </span>
      )
    }
    if (isDirty) {
      return (
        <span className="flex items-center gap-1 text-amber-600 font-semibold font-mono text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          未缝合更改
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-zinc-400 font-semibold font-mono text-[10px]">
        <CheckCircle size={11} />
        已安全缝合
      </span>
    )
  }, [saveStatus, isDirty])

  return (
    <footer className="flex h-8 items-center justify-between border-t border-dashed border-amber-900/15 bg-[#FAF8F4] px-5 text-[10px] text-zinc-500 font-mono select-none">
      {/* File Path */}
      <div className="flex items-center gap-1.5 max-w-[50%] truncate">
        <span className="text-zinc-400">印记:</span>
        <span className={currentFilePath ? 'text-zinc-600 font-medium' : 'text-zinc-400 italic'}>
          {currentFilePath || '未命名缝合大纲'}
        </span>
      </div>

      {/* Save Status & Counts */}
      <div className="flex items-center gap-4">
        {statusIndicator}

        <div className="h-3 w-[1px] border-r border-dashed border-amber-900/20" />

        <div className="flex items-center gap-3 text-zinc-400">
          <span>
            针脚数: <strong className="text-zinc-600 font-semibold">{countStats.nodes}</strong>
          </span>
          <span>
            线段字符: <strong className="text-zinc-600 font-semibold">{countStats.chars}</strong>
          </span>
        </div>
      </div>
    </footer>
  )
}
