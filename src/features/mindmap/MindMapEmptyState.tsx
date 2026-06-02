import { FileText } from 'lucide-react'

export function MindMapEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-linen text-zinc-400">
      <FileText size={42} className="mb-3 text-zinc-300" />
      <p className="font-mono text-xs font-semibold tracking-wider">请选择一个织物卡以查看导图</p>
    </div>
  )
}
