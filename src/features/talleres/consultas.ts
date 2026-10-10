import { supabase } from '@/shared/lib/supabase'
import type { Categoria, CategoriaCambios, CategoriaNueva, EstadoTaller, Taller, TallerGuardado } from './types'

/** Todas las categorías visibles para el rol: anon solo ve las activas, el admin ve también las inactivas. */
export async function obtenerCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase.from('categoria').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearCategoria(nueva: CategoriaNueva): Promise<Categoria> {
  const { data, error } = await supabase.from('categoria').insert(nueva).select().single()
  if (error) throw error
  return data
}

/** Si la RLS bloquea el UPDATE, no queda ninguna fila y `.single()` lo devuelve como error. */
export async function actualizarCategoria(id: number, cambios: CategoriaCambios): Promise<Categoria> {
  const { data, error } = await supabase
    .from('categoria')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Todos los talleres visibles para el rol: anon y los usuarios sin la marca de admin solo ven los publicados;
 * el admin ve también borradores e inactivos. El nivel viene de la categoría (`categoria.nivel_id`).
 */
export async function obtenerTalleres(): Promise<Taller[]> {
  const { data, error } = await supabase
    .from('taller')
    .select('*, categoria(nivel_id), destinatario(*), etiqueta(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Alta (sin `p_id`) o edición (con `p_id`) en una sola transacción; devuelve el id del taller. */
export async function guardarTaller(datos: TallerGuardado): Promise<number> {
  const { data, error } = await supabase.rpc('guardar_taller', datos)
  if (error) throw error
  return data
}

/** Baja (INACTIVO) o reactivación (BORRADOR). Si la RLS bloquea el UPDATE, `.single()` lo devuelve como error. */
export async function cambiarEstadoTaller(id: number, estado: EstadoTaller): Promise<void> {
  const { error } = await supabase.from('taller').update({ estado }).eq('id', id).select().single()
  if (error) throw error
}
