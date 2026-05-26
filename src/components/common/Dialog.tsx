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
        className="fixed inset-0 bg-zinc-900/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 text-zinc-800 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-all animate-scale-up font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200/60">
          <h3 className="text-lg font-semibold text-zinc-900 tracking-wide">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 transition focus:outline-none"
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
