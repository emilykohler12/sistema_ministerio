import { supabase } from '@/shared/lib/supabase'
import type { TablesInsert } from '@/shared/types/database'
import type { CambiosRecurso, Recurso } from './types'

const BUCKET = 'talleres'

/**
 * Sube un objeto nuevo (nunca `upsert`: cada subida usa una ruta nueva). storage-js ignora `contentType` cuando el
 * cuerpo es un `File`, así que el MIME canónico viaja en un `File` nuevo; el bucket valida contra ese tipo.
 */
export async function subirArchivo(ruta: string, file: File, mime: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, new File([file], file.name, { type: mime }), { upsert: false })
  if (error) throw error
}

/**
 * `remove()` devuelve `data: []` sin error cuando no borró nada (la RLS lo oculta o no existe): se trata como falla,
 * para que el aviso de huérfano de las secuencias no se pierda.
 */
export async function borrarArchivo(ruta: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).remove([ruta])
  if (error) throw error
  if (data.length === 0) throw new Error(`Storage no borró el objeto ${ruta}`)
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
