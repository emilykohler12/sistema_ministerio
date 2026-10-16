/**
 * Códigos que informa un error de Storage o de PostgREST (puro, sin imports de supabase). En storage-js (verificado
 * contra la base local) `status` es el de la respuesta HTTP (400, tanto para 413 como para 415) y `statusCode` es el
 * código real del rechazo: hay que mirar los dos. `code` es el de PostgREST/Postgres (`PGRST116`, `23505`...).
 */
export function codigosDeError(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return []
  const { status, statusCode, code } = error as { status?: unknown; statusCode?: unknown; code?: unknown }
  return [status, statusCode, code].filter((v) => typeof v === 'number' || typeof v === 'string').map(String)
}
