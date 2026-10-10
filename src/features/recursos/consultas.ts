import { borrarArchivo as borrarDelBucket, subirArchivo as subirAlBucket } from '@/shared/lib/storage'
import { supabase } from '@/shared/lib/supabase'
import type { TablesInsert } from '@/shared/types/database'
import type { CambiosRecurso, Recurso } from './types'

const BUCKET = 'talleres'

/** Wrappers finos sobre `shared/lib/storage` con el bucket `talleres`. */
export function subirArchivo(ruta: string, file: File, mime: string): Promise<void> {
  return subirAlBucket(BUCKET, ruta, file, mime)
}

export function borrarArchivo(ruta: string): Promise<void> {
  return borrarDelBucket(BUCKET, ruta)
}

export async function insertarRecurso(nuevo: TablesInsert<'recurso'>): Promise<Recurso> {
  const { data, error } = await supabase.from('recurso').insert(nuevo).select().single()
  if (error) throw error
  return data
}

/** Solo columnas editables (el grant de UPDATE por columna rechaza `taller_id`). Sin fila afectada, `.single()` falla. */
export async function actualizarRecurso(id: number, cambios: CambiosRecurso): Promise<Recurso> {
  const { data, error } = await supabase.from('recurso').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Si la RLS bloquea el DELETE no queda ninguna fila y `.single()` lo devuelve como error. */
export async function eliminarFilaRecurso(id: number): Promise<void> {
  const { error } = await supabase.from('recurso').delete().eq('id', id).select('id').single()
  if (error) throw error
}

/** `ids` es la lista completa de los recursos del taller, en el orden nuevo (lo valida la RPC). */
export async function ordenarRecursos(tallerId: number, ids: number[]): Promise<void> {
  const { error } = await supabase.rpc('ordenar_recursos', { p_taller_id: tallerId, p_ids: ids })
  if (error) throw error
}

/** Enlace firmado de 60 segundos para que el admin abra un archivo del bucket privado. */
export async function urlFirmada(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60)
  if (error) throw error
  return data.signedUrl
}
