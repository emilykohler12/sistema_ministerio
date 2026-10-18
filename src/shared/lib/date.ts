export function formatFecha(fechaIso: string) {
  const [year, month, day] = fechaIso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatFechaCorta(fechaIso: string) {
  const [year, month, day] = fechaIso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-AR')
}

/** Mes en letras y año (por ejemplo, "octubre de 2026") de una fecha `AAAA-MM-DD`, interpretada como local. */
export function formatMes(fechaIso: string) {
  const [year, month, day] = fechaIso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
}

/** Fecha local de un timestamp ISO completo (por ejemplo `updated_at` de Postgres). */
export function formatFechaDeTimestamp(timestampIso: string) {
  return new Date(timestampIso).toLocaleDateString('es-AR')
}

const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'

const FECHA_HORA_ARGENTINA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Fecha y hora de un timestamp ISO en hora de Argentina, sin depender de la zona del navegador (por ejemplo, "15/10/2026, 22:30"). */
export function formatFechaHoraArgentina(timestampIso: string) {
  return FECHA_HORA_ARGENTINA.format(new Date(timestampIso))
}
