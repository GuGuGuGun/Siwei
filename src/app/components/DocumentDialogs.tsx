import React from 'react'
import { FileImage, FileText, GitBranch, ListTree, Plus, Sparkles } from 'lucide-react'
import { Dialog } from '../../components/common/Dialog'
import { mindMapExportController } from '../../features/mindmap/mindMapExportController'
import type { ExportFormat, ImportApplyMode, ImportFormat, ImportPreview } from '../../types/document'

interface ImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (format: ImportFormat) => void
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ isOpen, onClose, onImport }) => (
  <Dialog isOpen={isOpen} onClose={onClose} title="导入文档">
    <div className="space-y-3 py-2 text-zinc-700 dark:text-zinc-300">
      <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
        从本地磁盘选择要导入的文件。Markdown 导入会自动解析无序缩进列表构建大纲。
      </p>
      <ImportOptionButton
        title="导入 OPML (.opml)"
        description="从幕布及主流大纲工具迁入层级、备注、任务和标签"
        onClick={() => onImport('opml')}
      />
      <ImportOptionButton
        title="导入 Markdown (.md)"
        description="解析标题层级、缩进列表、任务、标签和备注"
        onClick={() => onImport('markdown')}
      />
      <ImportOptionButton
        title="导入 JSON 备份 (.siwei.json)"
        description="加载完整的思帷大纲备份文件"
        onClick={() => onImport('json')}
      />
    </div>
  </Dialog>
)

const ImportOptionButton: React.FC<{
  title: string
  description: string
  onClick: () => void
}> = ({ title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-left shadow-sm transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
  >
    <div>
      <div className="text-[13px] font-semibold tracking-wide">{title}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{description}</div>
    </div>
    <Sparkles size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
  </button>
)

interface ExportDialogProps {
  isOpen: boolean
  isMindMapVisible: boolean
  onClose: () => void
  onExport: (format: ExportFormat) => void
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
      <ExportOptionButton title="导出 JSON 备份 (.siwei.json)" description="完整备份大纲树结构，包含节点元数据" format="json" onExport={onExport} />
      <ExportOptionButton title="导出 OPML (.opml)" description="用于迁移到幕布及其他大纲工具" format="opml" onExport={onExport} />
      <ExportOptionButton title="导出 Markdown (.md)" description="生成可迁移的大纲 Markdown 文件" format="markdown" onExport={onExport} />
      <ExportOptionButton title="导出 HTML (.html)" description="生成带基础样式的可读交付文档" format="html" onExport={onExport} />
      <ExportOptionButton title="导出纯文本 (.txt)" description="生成稳定缩进树，便于复制和审阅" format="text" onExport={onExport} />
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

const ExportOptionButton: React.FC<{
  title: string
  description: string
  format: ExportFormat
  onExport: (format: ExportFormat) => void
}> = ({ title, description, format, onExport }) => (
  <button
    type="button"
    onClick={() => onExport(format)}
    className="group flex w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-left shadow-sm transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
  >
    <div>
      <div className="text-[13px] font-semibold tracking-wide">{title}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{description}</div>
    </div>
    <Sparkles size={16} className="text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
  </button>
)

interface ImportPreviewDialogProps {
  isOpen: boolean
  preview: ImportPreview | null
  hasSelectedNode: boolean
  onClose: () => void
  onConfirm: (mode: ImportApplyMode) => void
}

export const ImportPreviewDialog: React.FC<ImportPreviewDialogProps> = ({
  isOpen,
  preview,
  hasSelectedNode,
  onClose,
  onConfirm,
}) => {
  const [mode, setMode] = React.useState<ImportApplyMode>('appendToRoot')
  const [showReport, setShowReport] = React.useState(false)

  React.useEffect(() => {
    if (!isOpen) return
    setMode('appendToRoot')
    setShowReport(false)
  }, [isOpen])

  if (!preview) return null

  const { summary, report } = preview

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="导入预览">
      <div className="space-y-4 text-zinc-700 dark:text-zinc-300">
        <div>
          <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{summary.title || '未命名文档'}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
            <PreviewMetric label="节点" value={summary.nodeCount} />
            <PreviewMetric label="层级" value={summary.maxDepth} />
            <PreviewMetric label="任务" value={summary.taskCount} />
            <PreviewMetric label="标签" value={summary.tagCount} />
            <PreviewMetric label="备注" value={summary.noteCount} />
            <PreviewMetric label="风险" value={summary.warningCount} />
          </div>
        </div>

        <div className="space-y-2">
          <ImportModeOption
            icon={FileText}
            checked={mode === 'newDocument'}
            title="作为新的未保存文档打开"
            description="当前编辑区会切换到导入结果"
            onChange={() => setMode('newDocument')}
          />
          <ImportModeOption
            icon={ListTree}
            checked={mode === 'appendToRoot'}
            title="追加到文档根节点末尾"
            description="导入内容会成为当前文档的一组顶层节点"
            onChange={() => setMode('appendToRoot')}
          />
          <ImportModeOption
            icon={GitBranch}
            checked={mode === 'appendToSelection'}
            title="追加到当前选中节点下"
            description={hasSelectedNode ? '导入内容会成为当前选中节点的子节点' : '需要先选中一个节点'}
            disabled={!hasSelectedNode}
            onChange={() => setMode('appendToSelection')}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowReport((value) => !value)}
          className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left text-[12px] text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span>导入报告</span>
          <span>{report.items.length} 项</span>
        </button>
        {showReport && (
          <div className="max-h-32 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {report.items.length === 0 ? (
              <div>没有需要保留或确认的迁移项。</div>
            ) : (
              report.items.map((item, index) => (
                <div key={`${item.field}-${index}`} className="border-b border-zinc-200 py-1 last:border-0 dark:border-zinc-800">
                  <div className="font-medium">{item.field}：{item.action}</div>
                  <div>{item.nodePath.join(' / ') || '文档'}</div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[12px] text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800">取消</button>
          <button
            type="button"
            onClick={() => onConfirm(mode)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <Plus size={14} />
            确认导入
          </button>
        </div>
      </div>
    </Dialog>
  )
}

const PreviewMetric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
    <div className="text-[10px]">{label}</div>
    <div className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">{value}</div>
  </div>
)

const ImportModeOption: React.FC<{
  icon: typeof FileText
  checked: boolean
  title: string
  description: string
  disabled?: boolean
  onChange: () => void
}> = ({ icon: Icon, checked, title, description, disabled = false, onChange }) => (
  <label className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${checked ? 'border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800' : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
    <input
      type="radio"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="h-3.5 w-3.5"
    />
    <Icon size={16} className="text-zinc-500" />
    <span>
      <span className="block text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">{title}</span>
      <span className="block text-[11px] text-zinc-500">{description}</span>
    </span>
  </label>
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
