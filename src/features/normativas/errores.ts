import { codigosDeError } from '@/shared/lib/erroresStorage'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'

const MENSAJE_GENERICO = 'No pudimos completar la operación. Probá de nuevo.'
const MENSAJE_DUPLICADA = 'Ya existe una normativa con ese número y año.'

/**
 * Mensaje para el usuario de un error de normativas: `23505` (número y año repetidos) o el rechazo del bucket,
 * 413 (tamaño) y 415 (formato), con los mismos motivos que da `validarPdf` antes de subir. Puro: sin imports de supabase.
 */
export function mensajeDeErrorNormativa(error: unknown): string {
  if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505') {
    return MENSAJE_DUPLICADA
  }
  const informados = codigosDeError(error)
  if (informados.includes('413')) return MOTIVO_TAMANIO
  if (informados.includes('415')) return MOTIVO_FORMATO
  return MENSAJE_GENERICO
}
