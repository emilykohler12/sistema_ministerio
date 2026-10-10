/**
 * Módulo puro, sin imports: se usa desde pantallas y tests sin cargar el cliente de Supabase.
 *
 * PostgREST no expone `constraint_name`: el nombre de la constraint viaja entre comillas dentro de `message`
 * (lo fija el pgTAP de `padron`). Un 23505 de cualquier otra constraint no es ninguno de los dos.
 */

function esUnicidadDe(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === '23505' && typeof message === 'string' && message.includes(`"${constraint}"`)
}

/** El nombre ya existe en la localidad (también contra los inactivos, sin distinguir mayúsculas ni tildes). */
export function esNombreDuplicado(error: unknown): boolean {
  return esUnicidadDe(error, 'establecimiento_localidad_nombre_uniq')
}

/** El CUE ya existe. */
export function esCueDuplicado(error: unknown): boolean {
  return esUnicidadDe(error, 'establecimiento_cue_key')
}
