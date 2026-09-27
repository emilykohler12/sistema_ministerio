import { type SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-11 w-full appearance-none rounded-lg border bg-white px-3.5 pr-9 text-sm text-gray-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600',
            error ? 'border-red-400' : 'border-gray-300',
            className,
          )}
          aria-invalid={error || undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    )
  },
)
Select.displayName = 'Select'
