import { X } from 'lucide-react'
import { useToastStore } from '@/store/toast'
import { cn } from '@/lib/utils'

const VARIANT_STYLES = {
  error: 'bg-[#3d1c1c] border-[#f85149]/60 text-[#f85149]',
  warning: 'bg-[#271700] border-[#d29922]/60 text-[#d29922]',
  info: 'bg-[#0d2137] border-[#58a6ff]/60 text-[#58a6ff]',
  success: 'bg-[#0d2113] border-[#3fb950]/60 text-[#3fb950]',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 px-3 py-2.5 border font-mono text-[12px] shadow-lg',
            VARIANT_STYLES[toast.variant],
          )}
        >
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity mt-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
