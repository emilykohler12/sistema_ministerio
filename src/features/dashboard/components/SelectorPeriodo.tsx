import { useCallback, useId } from 'react'
import { RangoFechas } from '@/shared/components/ui/RangoFechas'
import { ToggleGroup } from '@/shared/components/ui/ToggleGroup'
import { FieldError } from '@/shared/components/ui/FieldError'
import type { Periodo, TipoPeriodo } from '../periodo'

const OPCIONES: { value: TipoPeriodo; label: string }[] = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'anio', label: 'Año en curso' },
  { value: 'rango', label: 'Rango' },
]

interface SelectorPeriodoProps {
  periodo: Periodo
  /** Mensaje de `validarPeriodo`, o null si el período es válido. */
  error: string | null
  onTipo: (tipo: TipoPeriodo) => void
  onRango: (desde: string, hasta: string) => void
}

export function SelectorPeriodo({ periodo, error, onTipo, onRango }: SelectorPeriodoProps) {
  const idError = useId()
  // El tablero necesita las dos fechas: con un campo vacío no se aplica nada.
  const alCambiar = useCallback(
    (desde: string, hasta: string) => {
      if (desde && hasta) onRango(desde, hasta)
    },
    [onRango],
  )

  return (
    <div className="space-y-3">
      <ToggleGroup name="Período" options={OPCIONES} value={periodo.tipo} onChange={onTipo} />
      {periodo.tipo === 'rango' && (
        <div className="flex flex-wrap items-start gap-4">
          <RangoFechas
            desde={periodo.desde}
            hasta={periodo.hasta}
            error={error}
            idError={idError}
            onCambio={alCambiar}
          />
        </div>
      )}
      <FieldError id={idError} message={error ?? undefined} />
    </div>
  )
}
