import { cn } from '@/shared/lib/utils'

interface ToggleGroupProps<T extends string> {
  options: { value: T; label: string }[]
  value: T | T[]
  onChange: (value: T) => void
  multiple?: boolean
  name: string
}

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  name,
}: ToggleGroupProps<T>) {
  const isSelected = (v: T) => (multiple ? (value as T[]).includes(v) : value === v)

  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = isSelected(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600',
              selected
                ? 'border-primary-700 bg-primary-700 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
