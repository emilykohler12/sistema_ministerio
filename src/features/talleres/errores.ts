/** Módulo puro, sin imports: se usa desde pantallas y tests sin cargar el cliente de Supabase. */

/** Violación de unicidad de Postgres (23505): el nombre de la categoría ya existe en el nivel. */
export function esNombreDuplicado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

/**
 * Baja de una categoría con talleres en borrador o publicados (DA001): devuelve cuántos tiene,
 * o `null` si el error es otro o `details` no es un entero positivo (null, vacío, "abc", "0"...).
 * PostgREST entrega la cantidad en `details` (plural).
 */
export function categoriaConTalleres(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const { code, details } = error as { code?: unknown; details?: unknown }
  if (code !== 'DA001' || typeof details !== 'string' || !/^[1-9]\d*$/.test(details)) return null
  const cantidad = Number(details)
  return Number.isSafeInteger(cantidad) ? cantidad : null
}

/** Taller (no inactivo) en una categoría dada de baja (DA002). */
export function esCategoriaInactiva(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'DA002'
}

/** Mensaje para el usuario: las reglas del dominio (DA001, DA002) tienen el suyo; cualquier otro error, el genérico. */
export function mensajeDeError(error: unknown, generico: string): string {
  const talleres = categoriaConTalleres(error)
  if (talleres !== null) {
    return talleres === 1
      ? 'No se puede dar de baja: tiene 1 taller en borrador o publicado'
      : `No se puede dar de baja: tiene ${talleres} talleres en borrador o publicados`
  }
  if (esCategoriaInactiva(error)) return 'La categoría está dada de baja: reactivala primero'
  return generico
}
