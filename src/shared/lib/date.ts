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
