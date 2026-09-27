import { type KeyboardEvent, useId, useState } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
}

export function TagInput({ value, onChange, suggestions = [], placeholder }: TagInputProps) {
  const [input, setInput] = useState('')
  const listId = useId()

  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s),
  )

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-primary-600">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md bg-primary-100 px-2 py-1 text-xs font-medium text-primary-700"
          >
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Quitar ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-24 flex-1 border-none bg-transparent p-1 text-sm outline-none placeholder:text-gray-400"
          list={listId}
        />
      </div>
      {input && filteredSuggestions.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          {filteredSuggestions.slice(0, 6).map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => addTag(s)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
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
