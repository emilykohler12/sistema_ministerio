import { codigosDeError } from '@/shared/lib/erroresStorage'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'

const MENSAJE_GENERICO = 'No pudimos completar la operación. Probá de nuevo.'

/**
 * Mensaje para el usuario de un error de recursos. Storage rechaza con 413 (tamaño) o 415 (formato) aunque el
 * cliente no lo haya validado; se muestran los mismos motivos que da `validarArchivo` antes de subir.
 */
export function mensajeDeErrorRecurso(error: unknown): string {
  const informados = codigosDeError(error)
  if (informados.includes('413')) return MOTIVO_TAMANIO
  if (informados.includes('415')) return MOTIVO_FORMATO
  return MENSAJE_GENERICO
}
