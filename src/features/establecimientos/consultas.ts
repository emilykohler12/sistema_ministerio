import { supabase } from '@/shared/lib/supabase'
import type {
  CambiosEstablecimiento,
  DatosEstablecimiento,
  Establecimiento,
  GrupoSinVincular,
  Localidad,
} from './types'

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

/** Grupos de descargas "Otra" sin vincular, ya ordenados por la base. Solo el admin; sin la marca da `42501`. */
export async function obtenerSinVincular(): Promise<GrupoSinVincular[]> {
  const { data, error } = await supabase.rpc('instituciones_sin_vincular')
  if (error) throw error
  return data
}

/**
 * Vincula los registros del grupo `(localidad, nombre)` al establecimiento y devuelve cuántos tocó: 0 si otro admin ya lo
 * había hecho. `DA005` si el establecimiento está inactivo o es de otra localidad.
 */
export async function vincularInstitucion(
  localidadId: number,
  nombre: string,
  establecimientoId: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('vincular_institucion', {
    p_localidad_id: localidadId,
    p_nombre: nombre,
    p_establecimiento_id: establecimientoId,
  })
  if (error) throw error
  return data
}
