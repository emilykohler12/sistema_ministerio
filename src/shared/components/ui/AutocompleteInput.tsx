import { useId, useState } from 'react'
import { Input } from './Input'

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  id?: string
  error?: boolean
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  id,
  error,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        error={error}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && value && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-md"
        >
          {filtered.slice(0, 6).map((s) => (
            <li key={s} role="option" aria-selected={s === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s)
                  setOpen(false)
                }}
                className="block w-full px-3.5 py-2 text-left text-sm hover:bg-gray-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
