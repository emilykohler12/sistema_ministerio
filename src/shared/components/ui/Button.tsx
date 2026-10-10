import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { botonClases, type Size, type Variant } from './botonClases'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={botonClases(variant, size, className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
