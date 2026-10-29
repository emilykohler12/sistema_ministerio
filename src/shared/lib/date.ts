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

export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Fecha UTC a medianoche; `setUTCFullYear` evita que los años 0 a 99 se lean como 19xx (`Date.UTC` los toma así). */
function aFecha(anio: number, mes: number, dia: number): Date {
  const fecha = new Date(0)
  fecha.setUTCFullYear(anio, mes - 1, dia)
  return fecha
}

/** `AAAA-MM-DD` real (rechaza 2026-02-30) como Date UTC a medianoche, o null. El año 0 también se rechaza: JS lo tiene y Postgres no (22008). */
export function fechaReal(iso: string): Date | null {
  const m = FORMATO_FECHA.exec(iso)
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (anio < 1) return null
  const fecha = aFecha(anio, mes, dia)
  const coincide =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  return coincide ? fecha : null
}

/** Date UTC → `AAAA-MM-DD` con el año de 4 dígitos. */
export function fechaAIso(fecha: Date): string {
  const anio = String(fecha.getUTCFullYear()).padStart(4, '0')
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getUTCDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/** Suma (o resta, con negativos) días a una fecha `AAAA-MM-DD` ya validada. */
export function sumarDias(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const fecha = aFecha(anio, mes, dia)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fechaAIso(fecha)
}

/** Días corridos de `desde` a `hasta` (ambas `AAAA-MM-DD` ya validadas); negativo si `hasta` es anterior. */
export function diasEntre(desdeIso: string, hastaIso: string): number {
  const [d, h] = [desdeIso, hastaIso].map((iso) => {
    const [anio, mes, dia] = iso.split('-').map(Number)
    return aFecha(anio, mes, dia).getTime()
  })
  return Math.round((h - d) / 86_400_000)
}

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
