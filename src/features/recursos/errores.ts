import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'

const MENSAJE_GENERICO = 'No pudimos completar la operación. Probá de nuevo.'

/**
 * Códigos que informa el error. En storage-js (verificado contra la base local) `status` es el de la respuesta HTTP
 * (400, tanto para 413 como para 415) y `statusCode` es el código real del rechazo: hay que mirar los dos.
 */
function codigos(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return []
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  return [status, statusCode].filter((v) => typeof v === 'number' || typeof v === 'string').map(String)
}

/**
 * Mensaje para el usuario de un error de recursos. Storage rechaza con 413 (tamaño) o 415 (formato) aunque el
 * cliente no lo haya validado; se muestran los mismos motivos que da `validarArchivo` antes de subir.
 */
export function mensajeDeErrorRecurso(error: unknown): string {
  const informados = codigos(error)
  if (informados.includes('413')) return MOTIVO_TAMANIO
  if (informados.includes('415')) return MOTIVO_FORMATO
  return MENSAJE_GENERICO
}

/**
 * `true` si el servidor respondió y rechazó la escritura (hay `code`: SQLSTATE o PGRST…). Un corte de red llega con
 * `code: ''` y `status: 0`: la escritura pudo haberse confirmado, así que no se debe compensar borrando el archivo.
 */
export function esRechazoDelServidor(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code } = error as { code?: unknown }
  return typeof code === 'string' && code !== ''
}
