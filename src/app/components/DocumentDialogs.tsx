import React from 'react'
import { FileImage, FileText, Sparkles } from 'lucide-react'
import { Dialog } from '../../components/common/Dialog'
import { mindMapExportController } from '../../features/mindmap/mindMapExportController'

interface ImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (format: 'json' | 'markdown') => void
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ isOpen, onClose, onImport }) => (
  <Dialog isOpen={isOpen} onClose={onClose} title="导入文档">
    <div className="space-y-3 py-2 text-zinc-700 dark:text-zinc-300">
      <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
        从本地磁盘选择要导入的文件。Markdown 导入会自动解析无序缩进列表构建大纲。
      </p>
      <button
        type="button"
        onClick={() => onImport('json')}
        className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-left shadow-sm transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <div>
          <div className="text-[13px] font-semibold tracking-wide">导入 JSON 备份 (.siwei.json)</div>
          <div className="mt-1 text-[11px] text-zinc-500">加载完整的思帷大纲备份文件</div>
        </div>
        <Sparkles size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
      </button>
      <button
        type="button"
        onClick={() => onImport('markdown')}
        className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-left shadow-sm transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <div>
          <div className="text-[13px] font-semibold tracking-wide">导入 Markdown (.md)</div>
          <div className="mt-1 text-[11px] text-zinc-500">解析缩进列表语法转换为树节点</div>
        </div>
        <Sparkles size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
      </button>
    </div>
  </Dialog>
)

interface ExportDialogProps {
  isOpen: boolean
  isMindMapVisible: boolean
  onClose: () => void
  onExport: (format: 'json' | 'markdown') => void
  onMindMapExport: (format: 'png' | 'pdf') => void
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  isMindMapVisible,
  onClose,
  onExport,
  onMindMapExport,
}) => (
  <Dialog isOpen={isOpen} onClose={onClose} title="导出文档">
    <div className="space-y-3 py-2 text-zinc-700 dark:text-zinc-300">
      <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
        将当前大纲导出为本地文件备份。
      </p>
      <button
        type="button"
        onClick={() => onExport('json')}
        className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-left shadow-sm transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <div>
          <div className="text-[13px] font-semibold tracking-wide">导出 JSON 备份 (.siwei.json)</div>
          <div className="mt-1 text-[11px] text-zinc-500">完整备份大纲树结构，包含节点元数据</div>
        </div>
        <Sparkles size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
      </button>
      <button
        type="button"
        onClick={() => onExport('markdown')}
        className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-left shadow-sm transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <div>
          <div className="text-[13px] font-semibold tracking-wide">导出 Markdown (.md)</div>
          <div className="mt-1 text-[11px] text-zinc-500">生成便于阅读的纯文本无序缩进列表</div>
        </div>
        <Sparkles size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
      </button>
      {isMindMapVisible && (
        <>
          <div className="my-4 h-px bg-zinc-200/80 dark:bg-zinc-800" />
          <MindMapExportButton format="png" onClick={onMindMapExport} />
          <MindMapExportButton format="pdf" onClick={onMindMapExport} />
        </>
      )}
    </div>
  </Dialog>
)

const MindMapExportButton: React.FC<{
  format: 'png' | 'pdf'
  onClick: (format: 'png' | 'pdf') => void
}> = ({ format, onClick }) => {
  const isExporting = mindMapExportController.current.status === 'exporting'
  const title = format === 'png' ? '导出导图图片 (.png)' : '导出导图 PDF (.pdf)'
  const description = format === 'png'
    ? '生成隐藏编辑态标记的干净导图图片'
    : '将当前导图范围保存为可分享的 PDF'
  const Icon = format === 'png' ? FileImage : FileText

  return (
    <button
      type="button"
      onClick={() => onClick(format)}
      disabled={isExporting}
      className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-amber-50/80 p-3.5 text-left shadow-sm transition-all hover:border-amber-200 hover:bg-amber-100/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-amber-900/20 dark:hover:border-amber-700/50 dark:hover:bg-amber-900/40"
    >
      <div>
        <div className="text-[13px] font-semibold tracking-wide">
          {isExporting ? '正在导出导图' : title}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">{description}</div>
      </div>
      <Icon size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
    </button>
  )
}
