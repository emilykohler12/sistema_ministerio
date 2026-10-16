/*
 * Período del tablero (puro, sin supabase). Las fechas son AAAA-MM-DD y "hoy" es la fecha en hora de Argentina:
 * `toISOString()` daría el día siguiente después de las 21:00 locales.
 */
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
const ZONA = 'America/Argentina/Buenos_Aires'
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

const formatoLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hoyArgentina(ahora: Date = new Date()): string {
  const partes = Object.fromEntries(formatoLocal.formatToParts(ahora).map((p) => [p.type, p.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

/** Fecha UTC a medianoche; `setUTCFullYear` evita que los años 0 a 99 se lean como 19xx. */
function aFecha(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const fecha = new Date(0)
  fecha.setUTCFullYear(anio, mes - 1, dia)
  return fecha
}

function aIso(fecha: Date): string {
  const anio = String(fecha.getUTCFullYear()).padStart(4, '0')
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getUTCDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function sumarDias(iso: string, dias: number): string {
  const fecha = aFecha(iso)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return aIso(fecha)
}

/** Cantidad de días del período contando ambos extremos. */
function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000) + 1
}

function esFechaReal(valor: string | null): valor is string {
  return valor !== null && FORMATO_FECHA.test(valor) && aIso(aFecha(valor)) === valor
}

function armar(tipo: TipoPeriodo, desde: string, hasta: string): Periodo {
  return { tipo, desde, hasta, porMes: diasDelPeriodo(desde, hasta) > MAX_DIAS_POR_DIA }
}

export function periodoDesdeUrl(params: URLSearchParams, ahora: Date = new Date()): Periodo {
  const hoy = hoyArgentina(ahora)
  if (params.get('periodo') === 'anio') return armar('anio', `${hoy.slice(0, 4)}-01-01`, hoy)
  if (params.get('periodo') === 'rango') {
    const desde = params.get('desde')
    const hasta = params.get('hasta')
    if (esFechaReal(desde) && esFechaReal(hasta)) return armar('rango', desde, hasta)
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
