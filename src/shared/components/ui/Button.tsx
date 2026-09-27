import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/lib/utils'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800',
  secondary: 'bg-primary-100 text-primary-700 hover:bg-primary-200',
  outline: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  link: 'text-primary-600 underline-offset-4 hover:underline p-0 h-auto',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-10 w-10',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
