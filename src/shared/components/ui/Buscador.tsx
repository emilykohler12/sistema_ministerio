import { useId } from 'react'
import { Search } from 'lucide-react'

interface BuscadorProps {
  value: string
  onChange: (v: string) => void
  /** Nombre accesible del campo (solo para lectores de pantalla). */
  etiqueta: string
  placeholder: string
}

export function Buscador({ value, onChange, etiqueta, placeholder }: BuscadorProps) {
  const id = useId()
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      />
    </div>
  )
}
