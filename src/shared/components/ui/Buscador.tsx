import { Search } from 'lucide-react'

export function TallerBuscador({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <label htmlFor="taller-buscador" className="sr-only">
        Buscar por nombre o etiqueta
      </label>
      <input
        id="taller-buscador"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por nombre o etiqueta..."
        className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      />
    </div>
  )
}
