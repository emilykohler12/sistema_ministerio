import { borrarArchivo as borrarDelBucket, subirArchivo as subirAlBucket } from '@/shared/lib/storage'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database'
import type { ArgsGuardarNormativa, Normativa, ResultadoGuardarNormativa } from './types'

const BUCKET = 'normativas'
const MIME_PDF = 'application/pdf'

/** Wrappers finos sobre `shared/lib/storage` con el bucket público `normativas`. */
export function subirArchivo(ruta: string, file: File): Promise<void> {
  return subirAlBucket(BUCKET, ruta, file, MIME_PDF)
}

export function borrarArchivo(ruta: string): Promise<void> {
  return borrarDelBucket(BUCKET, ruta)
}

/** URL pública del PDF, sin `download`: el navegador lo abre en lugar de bajarlo. Se arma en el cliente, sin red. */
function urlPublica(ruta: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
}

/** Todas las normativas (lectura pública) con sus etiquetas y la URL pública del PDF. El orden lo aplica el hook. */
export async function obtenerNormativas(): Promise<Normativa[]> {
  const { data, error } = await supabase.from('normativa').select('*, etiqueta(*)')
  if (error) throw error
  return data.map((n) => ({ ...n, url: urlPublica(n.ruta_archivo) }))
}

/**
 * Alta (sin `p_id`) o edición (con `p_id`) en una sola transacción. `ruta_anterior` se tipa a mano como `string | null`
 * (typegen la da como `string`): solo viene si la RPC reemplazó el archivo.
 */
export async function guardarNormativa(args: ArgsGuardarNormativa): Promise<ResultadoGuardarNormativa> {
  const { data, error } = await supabase.rpc(
    'guardar_normativa',
    args as Database['public']['Functions']['guardar_normativa']['Args'],
  )
  if (error) throw error
  const fila = data?.[0] as ResultadoGuardarNormativa | undefined
  if (!fila) throw new Error('guardar_normativa no devolvió la fila')
  return { id: fila.id, ruta_anterior: fila.ruta_anterior ?? null }
}

/**
 * Borra la fila y devuelve la ruta del archivo que tenía en la base. Si la RLS bloquea el DELETE no queda ninguna fila y
 * `.single()` lo devuelve como error.
 */
export async function eliminarFilaNormativa(id: number): Promise<string> {
  const { data, error } = await supabase.from('normativa').delete().eq('id', id).select('ruta_archivo').single()
  if (error) throw error
  return data.ruta_archivo
}

/** Suma 1 al contador de la normativa (RPC definer, abierta a anon); no audita ni toca `updated_at`. */
export async function contarDescargaNormativa(id: number): Promise<void> {
  const { error } = await supabase.rpc('contar_descarga_normativa', { p_id: id })
  if (error) throw error
}
