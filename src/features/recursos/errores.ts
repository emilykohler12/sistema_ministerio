import { codigosDeError } from '@/shared/lib/erroresStorage'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'

const MENSAJE_GENERICO = 'No pudimos completar la operación. Probá de nuevo.'
const MENSAJE_CAMBIO = 'El recurso cambió o ya no existe. Actualizamos la lista.'

/**
 * Mensaje para el usuario de un error de recursos. Storage rechaza con 413 (tamaño) o 415 (formato) aunque el
 * cliente no lo haya validado; se muestran los mismos motivos que da `validarArchivo` antes de subir. `PGRST116`: el
 * UPDATE o el DELETE no afectó ninguna fila (otra pestaña la cambió o la borró, o la RLS la filtró). Solo lo
 * reciben `useActualizarRecurso`, `useReemplazarArchivo` y `useEliminarRecurso`, que invalidan la caché con éxito o sin
 * él (`onSettled`), así que la lista se actualiza; otra mutación que use este mensaje necesita lo mismo.
 */
export function mensajeDeErrorRecurso(error: unknown): string {
  const informados = codigosDeError(error)
  if (informados.includes('413')) return MOTIVO_TAMANIO
  if (informados.includes('415')) return MOTIVO_FORMATO
  if (informados.includes('PGRST116')) return MENSAJE_CAMBIO
  return MENSAJE_GENERICO
}
