/**
 * Códigos que informa un error de Storage (puro, sin imports de supabase). En storage-js (verificado contra la base
 * local) `status` es el de la respuesta HTTP (400, tanto para 413 como para 415) y `statusCode` es el código real del
 * rechazo: hay que mirar los dos.
 */
export function codigosDeError(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return []
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  return [status, statusCode].filter((v) => typeof v === 'number' || typeof v === 'string').map(String)
}
