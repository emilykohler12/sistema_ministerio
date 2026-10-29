import { useEffect, useId, useRef, useState } from 'react'
import { Input } from './Input'
import { Label } from './Label'

/** Espera a que termine de editar: al escribir el año, el navegador emite fechas intermedias válidas (0002-…, 0020-…) que no hay que usar. */
const ESPERA_MS = 300

interface RangoFechasProps {
  /** `AAAA-MM-DD`, o `''` si está vacío. */
  desde: string
  hasta: string
  /** Mensaje de error del rango, o null. Lo muestra quien usa el componente (con `FieldError id={idError}`). */
  error: string | null
  /** Id del `FieldError` donde se muestra `error`. */
  idError: string
  /** Se llama con los valores del borrador, 300 ms después de la última edición. `''` = vacío. */
  onCambio: (desde: string, hasta: string) => void
}

/** Dos campos de fecha con borrador local. Devuelve un fragmento: el contenedor (flex) lo pone quien lo usa. */
export function RangoFechas({ desde, hasta, error, idError, onCambio }: RangoFechasProps) {
  const idDesde = useId()
  const idHasta = useId()
  const [borrador, setBorrador] = useState({ desde, hasta })
  const [vistos, setVistos] = useState({ desde, hasta })

  // Si las props cambian desde afuera (URL, atrás/adelante, "Limpiar filtros"), los campos las siguen.
  if (vistos.desde !== desde || vistos.hasta !== hasta) {
    setVistos({ desde, hasta })
    setBorrador({ desde, hasta })
  }

  // La última función recibida: que el padre pase una nueva en cada render no reinicia la espera.
  const alCambiar = useRef(onCambio)
  useEffect(() => {
    alCambiar.current = onCambio
  })

  const hayCambio = borrador.desde !== desde || borrador.hasta !== hasta
  useEffect(() => {
    if (!hayCambio) return
    const espera = setTimeout(() => alCambiar.current(borrador.desde, borrador.hasta), ESPERA_MS)
    return () => clearTimeout(espera)
  }, [hayCambio, borrador.desde, borrador.hasta])

  return (
    <>
      <div>
        <Label htmlFor={idDesde}>Desde</Label>
        <Input
          id={idDesde}
          type="date"
          className="w-44"
          value={borrador.desde}
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
          value={borrador.hasta}
          error={error !== null}
          aria-describedby={error ? idError : undefined}
          onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
        />
      </div>
    </>
  )
}
