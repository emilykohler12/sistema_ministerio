import { supabase } from '@/shared/lib/supabase'
import type { Etiqueta } from './types'

/** Todas las etiquetas de la tabla (lectura pública), para sugerirlas en los formularios de taller y de normativa. */
export async function obtenerEtiquetas(): Promise<Etiqueta[]> {
  const { data, error } = await supabase.from('etiqueta').select('*').order('nombre')
  if (error) throw error
  return data
}
