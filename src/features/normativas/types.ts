import type { Etiqueta } from '@/features/etiquetas/types'
import type { Database, Tables } from '@/shared/types/database'

/**
 * Normativa con sus etiquetas y la URL pública de su PDF (bucket público `normativas`, que `consultas.ts` arma al leer).
 * El portal y el panel leen todas las filas: no hay estados.
 */
export type Normativa = Tables<'normativa'> & {
  etiqueta: Etiqueta[]
  url: string
}

/** Lo que el formulario entrega a las secuencias: sin el archivo, que viaja aparte. `descripcion` vacía es `null`. */
export interface DatosNormativa {
  titulo: string
  descripcion: string | null
  numero: string
  anio: number
  etiquetas: string[]
}

/**
 * Argumentos de la RPC `guardar_normativa`. Typegen los da todos como no nulos, pero `p_descripcion` admite `null`
 * y `p_ruta_archivo` nulo (o ausente) conserva el archivo de la base: se tipa a mano.
 */
export type ArgsGuardarNormativa = Omit<
  Database['public']['Functions']['guardar_normativa']['Args'],
  'p_descripcion' | 'p_ruta_archivo'
> & {
  p_descripcion: string | null
  p_ruta_archivo?: string | null
}

/** `ruta_anterior` es `null` salvo cuando la RPC reemplazó el archivo: es la única ruta que se puede borrar. */
export interface ResultadoGuardarNormativa {
  id: number
  ruta_anterior: string | null
}
