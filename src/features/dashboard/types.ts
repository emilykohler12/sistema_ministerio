import type { Database, Tables } from '@/shared/types/database'

type Funciones = Database['public']['Functions']

/** Filas de las RPC `metricas_*` (Fase A): solo conteos enteros, los porcentajes y la cobertura se calculan en el cliente. */
export type ResumenMetricas = Funciones['metricas_resumen']['Returns'][number]
export type PuntoSerie = Funciones['metricas_por_periodo']['Returns'][number]
export type FilaTaller = Funciones['metricas_por_taller']['Returns'][number]
export type FilaNivel = Funciones['metricas_por_nivel']['Returns'][number]
export type FilaCargo = Funciones['metricas_por_cargo']['Returns'][number]
export type FilaLocalidad = Funciones['metricas_por_localidad']['Returns'][number]

/** Contador acumulado por normativa (sin período). */
export type NormativaConteo = Pick<Tables<'normativa'>, 'id' | 'titulo' | 'numero' | 'anio' | 'descargas'>

export interface Metricas {
  resumen: ResumenMetricas
  serie: PuntoSerie[]
  talleres: FilaTaller[]
  niveles: FilaNivel[]
  cargos: FilaCargo[]
  localidades: FilaLocalidad[]
  normativas: NormativaConteo[]
}
