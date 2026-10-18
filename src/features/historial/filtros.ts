import { esEntidad } from './entidades'

export const TAMANIO_PAGINA = 50

export interface FiltrosHistorial {
  /** `AAAA-MM-DD`; el día completo en hora de Argentina. */
  desde: string | null
  hasta: string | null
  /** uuid de un usuario o `'sistema'` (operaciones sin usuario). */
  usuario: string | null
  /** Valor de `ENTIDADES_FILTRABLES`. */
  entidad: string | null
  /** Entero >= 1. */
  pagina: number
}

export const FILTROS_VACIOS: FiltrosHistorial = {
  desde: null,
  hasta: null,
  usuario: null,
  entidad: null,
  pagina: 1,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const ENTERO_POSITIVO = /^[1-9]\d*$/

/**
 * Argentina no tiene horario de verano desde 2009, así que el offset es fijo. El servidor (0024) usa la zona IANA: si el país
 * volviera a cambiarlo, hay que revisar esto junto con `formatFechaHoraArgentina`.
 */
const OFFSET_ARGENTINA = '-03:00'

function leerFecha(params: URLSearchParams, clave: string): string | null {
  const v = params.get(clave)
  return v === null || v === '' ? null : v
}

/** URL → filtros. Descarta lo inválido (usuario, entidad, página) para que un enlace editado a mano no deje la pantalla trabada. */
export function filtrosDesdeUrl(params: URLSearchParams): FiltrosHistorial {
  const usuario = params.get('usuario')
  const entidad = params.get('entidad')
  const pagina = params.get('pagina')
  const numero = pagina !== null && ENTERO_POSITIVO.test(pagina) ? Number(pagina) : 1
  return {
    desde: leerFecha(params, 'desde'),
    hasta: leerFecha(params, 'hasta'),
    usuario: usuario !== null && (usuario === 'sistema' || UUID.test(usuario)) ? usuario : null,
    entidad: entidad !== null && esEntidad(entidad) ? entidad : null,
    pagina: Number.isSafeInteger(numero) ? numero : 1,
  }
}

export function filtrosAUrl(f: FiltrosHistorial): URLSearchParams {
  const params = new URLSearchParams()
  if (f.desde) params.set('desde', f.desde)
  if (f.hasta) params.set('hasta', f.hasta)
  if (f.usuario) params.set('usuario', f.usuario)
  if (f.entidad) params.set('entidad', f.entidad)
  if (f.pagina > 1) params.set('pagina', String(f.pagina))
  return params
}

/** Fecha `AAAA-MM-DD` real (rechaza 2026-02-30). Se arma con `setUTCFullYear` porque `Date.UTC` toma los años 0-99 como 1900-1999. */
function fechaReal(fecha: string): Date | null {
  const m = FECHA.exec(fecha)
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (anio < 1) return null // JS tiene año 0 y Postgres no (22008)
  const d = new Date(0)
  d.setUTCFullYear(anio, mes - 1, dia)
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d : null
}

/** Mensaje de error o null. Solo fecha mal formada y `desde > hasta`: sin RPC de por medio, los topes del dashboard no protegen nada. */
export function validarFiltros(f: FiltrosHistorial): string | null {
  for (const fecha of [f.desde, f.hasta]) {
    if (fecha !== null && fechaReal(fecha) === null) return 'Ingresá una fecha válida.'
  }
  if (f.desde !== null && f.hasta !== null && f.desde > f.hasta)
    return 'La fecha "Desde" no puede ser posterior a "Hasta".'
  return null
}

function aTimestamp(d: Date): string {
  const anio = String(d.getUTCFullYear()).padStart(4, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(d.getUTCDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}T00:00:00${OFFSET_ARGENTINA}`
}

/** Límites del rango en hora de Argentina: medianoche de `desde` (inclusive) y medianoche del día siguiente a `hasta` (exclusiva). */
export function limitesDelDia(f: FiltrosHistorial): {
  desde: string | null
  hastaExclusivo: string | null
} {
  const desde = f.desde ? fechaReal(f.desde) : null
  const hasta = f.hasta ? fechaReal(f.hasta) : null
  if (hasta) hasta.setUTCDate(hasta.getUTCDate() + 1)
  return {
    desde: desde ? aTimestamp(desde) : null,
    hastaExclusivo: hasta ? aTimestamp(hasta) : null,
  }
}

export function hayFiltros(f: FiltrosHistorial): boolean {
  return f.desde !== null || f.hasta !== null || f.usuario !== null || f.entidad !== null
}
