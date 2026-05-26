import React from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, children }) => {
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900/95 text-zinc-100 p-6 shadow-2xl backdrop-blur-md transition-all animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-zinc-50">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
