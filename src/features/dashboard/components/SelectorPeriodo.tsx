import { useEffect, useId, useState } from 'react'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { ToggleGroup } from '@/shared/components/ui/ToggleGroup'
import { FieldError } from '@/shared/components/ui/FieldError'
import type { Periodo, TipoPeriodo } from '../periodo'

const OPCIONES: { value: TipoPeriodo; label: string }[] = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'anio', label: 'Año en curso' },
  { value: 'rango', label: 'Rango' },
]

/** Espera a que termine de editar las fechas: escribir un año genera fechas intermedias que no hay que consultar. */
const ESPERA_RANGO_MS = 300

interface SelectorPeriodoProps {
  periodo: Periodo
  /** Mensaje de `validarPeriodo`, o null si el período es válido. */
  error: string | null
  onTipo: (tipo: TipoPeriodo) => void
  onRango: (desde: string, hasta: string) => void
}

export function SelectorPeriodo({ periodo, error, onTipo, onRango }: SelectorPeriodoProps) {
  const idError = useId()
  const idDesde = useId()
  const idHasta = useId()
  const [borrador, setBorrador] = useState({ desde: periodo.desde, hasta: periodo.hasta })
  const [vistos, setVistos] = useState({ desde: periodo.desde, hasta: periodo.hasta })

  // Si el período cambia desde afuera (URL, atrás/adelante), los campos lo siguen.
  if (vistos.desde !== periodo.desde || vistos.hasta !== periodo.hasta) {
    setVistos({ desde: periodo.desde, hasta: periodo.hasta })
    setBorrador({ desde: periodo.desde, hasta: periodo.hasta })
  }

  const { desde, hasta } = borrador
  const hayCambio = desde !== periodo.desde || hasta !== periodo.hasta
  useEffect(() => {
    if (periodo.tipo !== 'rango' || !hayCambio || !desde || !hasta) return
    const espera = setTimeout(() => onRango(desde, hasta), ESPERA_RANGO_MS)
    return () => clearTimeout(espera)
  }, [periodo.tipo, hayCambio, desde, hasta, onRango])

  return (
    <div className="space-y-3">
      <ToggleGroup name="Período" options={OPCIONES} value={periodo.tipo} onChange={onTipo} />
      {periodo.tipo === 'rango' && (
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <Label htmlFor={idDesde}>Desde</Label>
            <Input
              id={idDesde}
              type="date"
              className="w-44"
              value={desde}
              error={error !== null}
              aria-describedby={error ? idError : undefined}
              onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor={idHasta}>Hasta</Label>
            <Input
              id={idHasta}
              type="date"
              className="w-44"
              value={hasta}
              error={error !== null}
              aria-describedby={error ? idError : undefined}
              onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
            />
          </div>
        </div>
      )}
      <FieldError id={idError} message={error ?? undefined} />
    </div>
  )
}
