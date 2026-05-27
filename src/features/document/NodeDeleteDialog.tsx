import React from 'react'
import { Dialog } from '../../components/common/Dialog'

interface NodeDeleteDialogProps {
  message: string
  onCancel: () => void
  onConfirm: () => void
}

export const NodeDeleteDialog: React.FC<NodeDeleteDialogProps> = ({
  message,
  onCancel,
  onConfirm,
}) => {
  return (
    <Dialog isOpen onClose={onCancel} title="删除节点">
      <div className="space-y-5">
        <p className="text-sm leading-6 text-zinc-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
            onClick={onConfirm}
          >
            删除
          </button>
        </div>
      </div>
    </Dialog>
  )
}
