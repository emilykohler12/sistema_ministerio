import { DESTINATARIOS, NIVELES_FILTRO, type Destinatario, type Nivel } from '../types'
import { Select } from '@/shared/components/ui/Select'

export interface FiltrosState {
  nivel: Nivel | ''
  destinatario: Destinatario | ''
}

export function TallerFiltros({
  value,
  onChange,
}: {
  value: FiltrosState
  onChange: (value: FiltrosState) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="filtro-nivel" className="sr-only">
          Nivel
        </label>
        <Select
          id="filtro-nivel"
          value={value.nivel}
          onChange={(e) => onChange({ ...value, nivel: e.target.value as Nivel | '' })}
        >
          <option value="">Nivel</option>
          {NIVELES_FILTRO.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor="filtro-destinatario" className="sr-only">
          Destinado a
        </label>
        <Select
          id="filtro-destinatario"
          value={value.destinatario}
          onChange={(e) => onChange({ ...value, destinatario: e.target.value as Destinatario | '' })}
        >
          <option value="">Destinado a</option>
          {DESTINATARIOS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
