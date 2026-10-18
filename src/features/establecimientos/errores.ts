import { codigosDeError } from '@/shared/lib/erroresStorage'

/**
 * Módulo puro, sin imports de supabase: se usa desde pantallas y tests sin cargar el cliente de Supabase.
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

/** La vinculación se rechazó: el establecimiento no existe, está inactivo o es de otra localidad (`DA005`). */
export function esVinculacionInvalida(error: unknown): boolean {
  return codigosDeError(error).includes('DA005')
}

export const MENSAJE_NOMBRE_DUPLICADO =
  'Ya existe un establecimiento con ese nombre en esta localidad (puede estar dado de baja)'
export const MENSAJE_CUE_DUPLICADO = 'Ya existe un establecimiento con ese CUE'
export const MENSAJE_VINCULACION_INVALIDA =
  'Ese establecimiento ya no está disponible en la localidad. Elegí otro de la lista actualizada.'
