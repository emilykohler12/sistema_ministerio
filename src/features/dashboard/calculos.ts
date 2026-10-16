/* Cálculos del tablero (puros, sin supabase): las RPC devuelven conteos y el cliente decide redondeo y orden. */

const redondear = (n: number) => Math.round(n * 10) / 10

/** `n` sobre `total` en porcentaje con un decimal; sin total no hay porcentaje. */
export function porcentaje(n: number, total: number): number | null {
  return total === 0 ? null : redondear((n / total) * 100)
}

/** Alcanzados sobre el padrón; con padrón 0 no hay cobertura (se muestra "—"). */
export function cobertura(alcanzados: number, padron: number): number | null {
  return porcentaje(alcanzados, padron)
}

/** Agrega el porcentaje de cada fila sobre la suma de `descargas`, conservando el orden. */
export function conPorcentajes<T extends { descargas: number }>(filas: T[]): (T & { porcentaje: number | null })[] {
  const total = filas.reduce((suma, f) => suma + f.descargas, 0)
  return filas.map((f) => ({ ...f, porcentaje: porcentaje(f.descargas, total) }))
}

const comparadorTexto = new Intl.Collator('es-AR', { sensitivity: 'base' })

export function ordenarTalleres<T extends { taller_id: number; descargas: number }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => b.descargas - a.descargas || a.taller_id - b.taller_id)
}

export function ordenarLocalidades<T extends { nombre: string; descargas: number }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => b.descargas - a.descargas || comparadorTexto.compare(a.nombre, b.nombre))
}

export function ordenarNormativas<T extends { id: number; descargas: number }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => b.descargas - a.descargas || a.id - b.id)
}
