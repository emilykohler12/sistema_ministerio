import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600',
          error ? 'border-red-400' : 'border-gray-300',
          className,
        )}
        aria-invalid={error || undefined}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'
