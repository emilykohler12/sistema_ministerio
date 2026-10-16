import { supabase } from '@/shared/lib/supabase'
import type { Metricas } from './types'

interface Respuesta<T> {
  data: T | null
  error: Error | null
}

function leer<T>({ data, error }: Respuesta<T>): T {
  if (error) throw error
  if (data === null) throw new Error('La consulta de métricas no devolvió datos.')
  return data
}

/**
 * Las seis RPC del período y el select de normativas (contador acumulado, sin período) en paralelo:
 * si una sola falla, falla todo. Sin ordenar ni calcular: eso es de `calculos.ts`.
 */
export async function obtenerMetricas(periodo: { desde: string; hasta: string; porMes: boolean }): Promise<Metricas> {
  const args = { p_desde: periodo.desde, p_hasta: periodo.hasta }
  const [resumen, serie, talleres, niveles, cargos, localidades, normativas] = await Promise.all([
    supabase.rpc('metricas_resumen', args),
    supabase.rpc('metricas_por_periodo', { ...args, p_por_mes: periodo.porMes }),
    supabase.rpc('metricas_por_taller', args),
    supabase.rpc('metricas_por_nivel', args),
    supabase.rpc('metricas_por_cargo', args),
    supabase.rpc('metricas_por_localidad', args),
    supabase.from('normativa').select('id, titulo, numero, anio, descargas'),
  ])
  const [filaResumen] = leer(resumen)
  if (!filaResumen) throw new Error('metricas_resumen no devolvió ninguna fila.')
  return {
    resumen: filaResumen,
    serie: leer(serie),
    talleres: leer(talleres),
    niveles: leer(niveles),
    cargos: leer(cargos),
    localidades: leer(localidades),
    normativas: leer(normativas),
  }
}
