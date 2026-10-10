import { supabase } from '@/shared/lib/supabase'
import type { Categoria, CategoriaCambios, CategoriaNueva } from './types'

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
