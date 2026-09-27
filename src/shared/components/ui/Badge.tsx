import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

type Variant = 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-700 text-white',
  secondary: 'bg-primary-100 text-primary-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  neutral: 'bg-gray-100 text-gray-600',
}

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}
