import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

interface ErrorFallbackProps {
  message?: string
  onRetry?: () => void
}

export function ErrorFallback({
  message = 'Ocurrió un error al cargar la información.',
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center"
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-red-500" aria-hidden="true" />
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
