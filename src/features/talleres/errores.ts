/** Módulo puro, sin imports: se usa desde pantallas y tests sin cargar el cliente de Supabase. */

/** Violación de unicidad de Postgres (23505): el nombre de la categoría ya existe en el nivel. */
export function esNombreDuplicado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}
