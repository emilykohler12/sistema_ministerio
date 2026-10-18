import { supabase } from '@/shared/lib/supabase'
import { tablasDeEntidad } from './entidades'
import { TAMANIO_PAGINA, limitesDelDia, type FiltrosHistorial } from './filtros'
import type { Operacion, UsuarioHistorial } from './types'

/** Página fuera de rango: con `count: 'exact'` PostgREST responde 416 en lugar de un array vacío. */
const PAGINA_FUERA_DE_RANGO = 'PGRST103'

export interface PaginaHistorial {
  filas: Operacion[]
  /** `null` cuando la página está fuera de rango: el error no trae el conteo. */
  total: number | null
}

/**
 * Una página del historial, de la más reciente a la más vieja. Ordena por `id` y no por `fecha_hora`: las filas de un mismo
 * `guardar_taller` comparten fecha y el offset entre páginas sería inestable.
 */
export async function obtenerHistorial(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
  const { desde, hastaExclusivo } = limitesDelDia(filtros)
  let consulta = supabase.from('registro_operacion').select('*', { count: 'exact' })
  if (desde) consulta = consulta.gte('fecha_hora', desde)
  if (hastaExclusivo) consulta = consulta.lt('fecha_hora', hastaExclusivo)
  if (filtros.usuario === 'sistema') consulta = consulta.is('usuario_id', null)
  else if (filtros.usuario) consulta = consulta.eq('usuario_id', filtros.usuario)
  if (filtros.entidad) consulta = consulta.in('tabla', tablasDeEntidad(filtros.entidad))

  const primera = (filtros.pagina - 1) * TAMANIO_PAGINA
  const { data, error, count } = await consulta
    .order('id', { ascending: false })
    .range(primera, primera + TAMANIO_PAGINA - 1)
  if (error) {
    if (error.code === PAGINA_FUERA_DE_RANGO) return { filas: [], total: null }
    throw error
  }
  return { filas: data ?? [], total: count }
}

/** Usuarios con operaciones, con su email (RPC definer: el admin no lee `auth.users`). */
export async function obtenerUsuariosHistorial(): Promise<UsuarioHistorial[]> {
  const { data, error } = await supabase.rpc('usuarios_historial')
  if (error) throw error
  return data ?? []
}
