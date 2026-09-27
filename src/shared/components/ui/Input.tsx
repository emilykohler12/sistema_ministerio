import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border bg-white px-3.5 text-sm text-gray-900 placeholder:text-gray-400',
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
Input.displayName = 'Input'
