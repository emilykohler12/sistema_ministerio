import { type ReactNode, useRef } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { cn } from '@/shared/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        className={cn(
          'relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-primary-700">
              {title}
            </h2>
            {description && (
              <p id="dialog-description" className="mt-0.5 text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
