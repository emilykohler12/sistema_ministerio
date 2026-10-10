import type { Recurso } from '@/features/recursos/types'
import type { Database, Enums, Tables, TablesInsert } from '@/shared/types/database'

export type NivelEducativo = Tables<'nivel_educativo'>

/**
 * Los 5 niveles de la decisión 0008. Es un catálogo fijo: ningún rol de la API los modifica.
 * Debe coincidir con la migración `niveles_categorias` (el pgTAP compara las filas exactas).
 */
export const NIVELES = [
  { id: 1, nombre: 'Inicial', orden: 1 },
  { id: 2, nombre: 'Primario', orden: 2 },
  { id: 3, nombre: 'Secundario', orden: 3 },
  { id: 4, nombre: 'Terciario', orden: 4 },
  { id: 5, nombre: 'Formación profesional', orden: 5 },
] as const satisfies readonly NivelEducativo[]

export function nombreNivel(id: number) {
  return NIVELES.find((n) => n.id === id)?.nombre ?? String(id)
}

/** Id numérico de un parámetro de la URL: entero positivo, o `null` si no lo es (o no está). */
export function idDeRuta(param: string | undefined): number | null {
  if (param === undefined || !/^[1-9]\d*$/.test(param)) return null
  const id = Number(param)
  return Number.isSafeInteger(id) ? id : null
}

export type Categoria = Tables<'categoria'>
export type CategoriaNueva = Pick<TablesInsert<'categoria'>, 'nivel_id' | 'nombre' | 'descripcion'>
export type CategoriaCambios = Partial<Pick<Categoria, 'nombre' | 'descripcion' | 'activo'>>

export type EstadoTaller = Enums<'estado_taller'>

/** Etiqueta en español de cada estado; `satisfies` obliga a cubrir todos los valores del enum. */
export const ETIQUETA_ESTADO = {
  BORRADOR: 'Borrador',
  PUBLICADO: 'Publicado',
  INACTIVO: 'Inactivo',
} satisfies Record<EstadoTaller, string>

export type Destinatario = Tables<'destinatario'>

/**
 * Los 5 destinatarios de la migración `talleres` (P-02). Catálogo fijo: ningún rol de la API los modifica.
 * Debe coincidir con la base (el pgTAP compara las filas exactas); si cambia la lista, es una migración más esta constante.
 */
export const DESTINATARIOS = [
  { id: 1, nombre: 'Directivos' },
  { id: 2, nombre: 'Familias' },
  { id: 3, nombre: 'Estudiantes' },
  { id: 4, nombre: 'Docentes' },
  { id: 5, nombre: 'Comunidad educativa' },
] as const satisfies readonly Destinatario[]

export type Etiqueta = Tables<'etiqueta'>

/** Taller con lo que el portal y el panel necesitan: el nivel (vía la categoría), sus destinatarios, etiquetas y recursos (por `orden`, `id`). */
export type Taller = Tables<'taller'> & {
  categoria: Pick<Categoria, 'nivel_id'>
  destinatario: Destinatario[]
  etiqueta: Etiqueta[]
  recurso: Recurso[]
}

/** Argumentos de la RPC `guardar_taller`: el alta omite `p_id`, la edición lo manda. */
export type TallerGuardado = Database['public']['Functions']['guardar_taller']['Args']
