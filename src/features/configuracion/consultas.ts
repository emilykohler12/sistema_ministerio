import { supabase } from '@/shared/lib/supabase'
import type { Configuracion, ConfiguracionCambios } from './types'

export async function obtenerConfiguracion(): Promise<Configuracion> {
  const { data, error } = await supabase.from('configuracion').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

/** Si la RLS bloquea el UPDATE, no queda ninguna fila y `.single()` lo devuelve como error. */
export async function guardarConfiguracion(cambios: ConfiguracionCambios): Promise<Configuracion> {
  const { data, error } = await supabase
    .from('configuracion')
    .update(cambios)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw error
  return data
}
