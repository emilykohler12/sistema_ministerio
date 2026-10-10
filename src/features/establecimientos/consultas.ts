import { supabase } from '@/shared/lib/supabase'
import type { CambiosEstablecimiento, DatosEstablecimiento, Establecimiento, Localidad } from './types'

/** Los 79 municipios, ordenados por nombre. Los puede leer cualquier rol. */
export async function obtenerLocalidades(): Promise<Localidad[]> {
  const { data, error } = await supabase.from('localidad').select('*').order('nombre')
  if (error) throw error
  return data
}

/**
 * Establecimientos de una localidad. Anon y los usuarios sin la marca de admin solo ven los activos; el admin ve también
 * los inactivos. Se filtra por localidad por el tope de 1000 filas de PostgREST.
 */
export async function obtenerEstablecimientos(localidadId: number): Promise<Establecimiento[]> {
  const { data, error } = await supabase
    .from('establecimiento')
    .select('*')
    .eq('localidad_id', localidadId)
    .order('nombre')
    .order('id')
  if (error) throw error
  return data
}

/** Un establecimiento por id, o `null` si no existe (o la RLS no lo deja ver). */
export async function obtenerEstablecimiento(id: number): Promise<Establecimiento | null> {
  const { data, error } = await supabase.from('establecimiento').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function crearEstablecimiento(datos: DatosEstablecimiento): Promise<Establecimiento> {
  const { data, error } = await supabase.from('establecimiento').insert(datos).select().single()
  if (error) throw error
  return data
}

/** Si la RLS bloquea el UPDATE, no queda ninguna fila y `.single()` lo devuelve como error. */
export async function actualizarEstablecimiento(
  id: number,
  cambios: CambiosEstablecimiento,
): Promise<Establecimiento> {
  const { data, error } = await supabase
    .from('establecimiento')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
