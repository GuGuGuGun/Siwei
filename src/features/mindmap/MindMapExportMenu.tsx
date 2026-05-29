import React from 'react'
import { FileImage, FileText } from 'lucide-react'

export type MindMapExportFormat = 'png' | 'pdf'

interface MindMapExportMenuProps {
  status: 'idle' | 'exporting'
  onExport: (format: MindMapExportFormat) => void
  className?: string
}

export const MindMapExportMenu: React.FC<MindMapExportMenuProps> = ({ status, onExport, className }) => {
  return (
    <div className={className ?? 'absolute left-4 top-16 z-20 w-44 rounded-lg border border-amber-900/10 bg-[#FAF8F4]/95 p-1.5 text-xs shadow-fabric'}>
      <button
        type="button"
        role="menuitem"
        disabled={status === 'exporting'}
        onClick={() => onExport('png')}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-zinc-700 transition enabled:hover:bg-amber-100/60 disabled:text-zinc-300"
      >
        <FileImage className="h-3.5 w-3.5" />
        <span>{status === 'exporting' ? '正在导出导图' : '导出图片'}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={status === 'exporting'}
        onClick={() => onExport('pdf')}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-zinc-700 transition enabled:hover:bg-amber-100/60 disabled:text-zinc-300"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>{status === 'exporting' ? '正在导出导图' : '导出 PDF'}</span>
      </button>
    </div>
  )
}
