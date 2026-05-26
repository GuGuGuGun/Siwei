import React from 'react'
import { create } from 'zustand'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: ToastMessage[]
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Math.random().toString()
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, 4000)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

export const toast = {
  success: (msg: string) => useToastStore.getState().addToast(msg, 'success'),
  error: (msg: string) => useToastStore.getState().addToast(msg, 'error'),
  info: (msg: string) => useToastStore.getState().addToast(msg, 'info'),
}

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  return (
    <div className="fixed bottom-12 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((item) => {
        const icon = {
          success: <CheckCircle className="h-5 w-5 text-emerald-500" />,
          error: <AlertCircle className="h-5 w-5 text-rose-500" />,
          info: <Info className="h-5 w-5 text-sky-500" />,
        }[item.type]

        const bgClass = {
          success: 'bg-emerald-950/80 border-emerald-500/30 text-emerald-100',
          error: 'bg-rose-950/80 border-rose-500/30 text-rose-100',
          info: 'bg-zinc-900/85 border-zinc-700/50 text-zinc-100',
        }[item.type]

        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-md pointer-events-auto transition-all duration-300 transform translate-y-0 opacity-100 animate-slide-in ${bgClass}`}
          >
            <div>{icon}</div>
            <div className="flex-1 text-sm font-medium leading-5">{item.message}</div>
            <button
              onClick={() => removeToast(item.id)}
              className="text-zinc-400 hover:text-zinc-200 transition focus:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
