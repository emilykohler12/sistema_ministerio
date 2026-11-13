import type { Database } from '@/shared/types/database'

type Funciones = Database['public']['Functions']

/** Filas de las RPC `metricas_*` (Fase A): solo conteos enteros, los porcentajes y la cobertura se calculan en el cliente. */
export type ResumenMetricas = Funciones['metricas_resumen']['Returns'][number]
export type PuntoSerie = Funciones['metricas_por_periodo']['Returns'][number]
export type FilaTaller = Funciones['metricas_por_taller']['Returns'][number]
export type FilaNivel = Funciones['metricas_por_nivel']['Returns'][number]
export type FilaCargo = Funciones['metricas_por_cargo']['Returns'][number]
export type FilaLocalidad = Funciones['metricas_por_localidad']['Returns'][number]

/** Por normativa: total histórico (`descargas`) y descargas con día dentro del período (`descargas_periodo`). */
export type NormativaConteo = Funciones['metricas_normativas']['Returns'][number]

export interface Metricas {
  resumen: ResumenMetricas
  serie: PuntoSerie[]
  talleres: FilaTaller[]
  niveles: FilaNivel[]
  cargos: FilaCargo[]
  localidades: FilaLocalidad[]
  normativas: NormativaConteo[]
}
