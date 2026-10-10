import { DESTINATARIOS, NIVELES } from '../types'
import { Select } from '@/shared/components/ui/Select'

export interface FiltrosState {
  nivel: number | ''
  destinatario: number | ''
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
          onChange={(e) => onChange({ ...value, nivel: e.target.value === '' ? '' : Number(e.target.value) })}
        >
          <option value="">Nivel</option>
          {NIVELES.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
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
          onChange={(e) =>
            onChange({ ...value, destinatario: e.target.value === '' ? '' : Number(e.target.value) })
          }
        >
          <option value="">Destinado a</option>
          {DESTINATARIOS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
