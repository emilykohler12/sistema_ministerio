import { codigosDeError } from '@/shared/lib/erroresStorage'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'

const MENSAJE_GENERICO = 'No pudimos completar la operación. Probá de nuevo.'
export const MENSAJE_LOGO_CAMBIADO = 'El logo cambió en otra sesión: ya mostramos el actual. Probá de nuevo.'

/**
 * Mensaje para el usuario de un error del logo: el rechazo del bucket, 413 (tamaño) y 415 (formato), con los mismos
 * motivos que da `validarLogo` antes de subir, o `PGRST116` (otro admin cambió el logo mientras: el UPDATE condicional
 * no encontró la fila). Puro: sin imports de supabase.
 */
export function mensajeDeErrorLogo(error: unknown): string {
  const informados = codigosDeError(error)
  if (informados.includes('413')) return MOTIVO_TAMANIO
  if (informados.includes('415')) return MOTIVO_FORMATO
  if (informados.includes('PGRST116')) return MENSAJE_LOGO_CAMBIADO
  return MENSAJE_GENERICO
}
