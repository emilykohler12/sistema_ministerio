const MENSAJE_TALLER = 'Este taller ya no está disponible'
const MENSAJE_INSTITUCION = 'La institución elegida ya no está disponible'
const MENSAJE_GENERICO = 'No pudimos completar la descarga. Probá de nuevo.'

function codigoDe(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
}

/** `DA003` de `registrar_descarga`: el taller no existe o ya no está publicado. */
export function esTallerNoDisponible(error: unknown): boolean {
  return codigoDe(error) === 'DA003'
}

/** `DA004` de `registrar_descarga`: el establecimiento no existe, está inactivo o no es de la localidad. */
export function esInstitucionNoDisponible(error: unknown): boolean {
  return codigoDe(error) === 'DA004'
}

/** Mensaje para el usuario de un error de la descarga. Puro: sin imports de supabase. */
export function mensajeDeErrorDescarga(error: unknown): string {
  if (esTallerNoDisponible(error)) return MENSAJE_TALLER
  if (esInstitucionNoDisponible(error)) return MENSAJE_INSTITUCION
  return MENSAJE_GENERICO
}
