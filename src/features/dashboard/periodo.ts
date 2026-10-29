/*
 * Período del tablero (puro, sin supabase). Las fechas son AAAA-MM-DD y "hoy" es la fecha en hora de Argentina:
 * `toISOString()` daría el día siguiente después de las 21:00 locales.
 */
import { ZONA_ARGENTINA, diasEntre, fechaReal, sumarDias } from '@/shared/lib/date'

export type TipoPeriodo = '30d' | 'anio' | 'rango'

export interface Periodo {
  tipo: TipoPeriodo
  desde: string
  hasta: string
  porMes: boolean
}

export const FECHA_MINIMA = '2020-01-01'

/** Hasta esta cantidad de días (inclusive) la serie va por día; más allá, por mes. */
const MAX_DIAS_POR_DIA = 92

const formatoLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_ARGENTINA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hoyArgentina(ahora: Date = new Date()): string {
  const partes = Object.fromEntries(formatoLocal.formatToParts(ahora).map((p) => [p.type, p.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

function armar(tipo: TipoPeriodo, desde: string, hasta: string): Periodo {
  return { tipo, desde, hasta, porMes: diasEntre(desde, hasta) + 1 > MAX_DIAS_POR_DIA }
}

export function periodoDesdeUrl(params: URLSearchParams, ahora: Date = new Date()): Periodo {
  const hoy = hoyArgentina(ahora)
  if (params.get('periodo') === 'anio') return armar('anio', `${hoy.slice(0, 4)}-01-01`, hoy)
  if (params.get('periodo') === 'rango') {
    const desde = params.get('desde')
    const hasta = params.get('hasta')
    if (desde !== null && hasta !== null && fechaReal(desde) && fechaReal(hasta)) return armar('rango', desde, hasta)
  }
  return armar('30d', sumarDias(hoy, -29), hoy)
}

export function parametrosDePeriodo(periodo: Periodo): URLSearchParams {
  const params = new URLSearchParams({ periodo: periodo.tipo })
  if (periodo.tipo === 'rango') {
    params.set('desde', periodo.desde)
    params.set('hasta', periodo.hasta)
  }
  return params
}

/** Mensaje de error en español, o null si el período cumple `FECHA_MINIMA <= desde <= hasta <= hoy`. */
export function validarPeriodo(periodo: Periodo, ahora: Date = new Date()): string | null {
  if (periodo.desde < FECHA_MINIMA) return 'La fecha "Desde" no puede ser anterior al 01/01/2020.'
  if (periodo.desde > periodo.hasta) return 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".'
  if (periodo.hasta > hoyArgentina(ahora)) return 'La fecha "Hasta" no puede ser posterior a hoy.'
  return null
}
