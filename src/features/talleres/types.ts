import type { Tables, TablesInsert } from '@/shared/types/database'

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

export type Destinatario = 'directivos' | 'familias' | 'estudiantes' | 'docentes' | 'comunidad'

export const DESTINATARIOS: { value: Destinatario; label: string }[] = [
  { value: 'directivos', label: 'Directivos' },
  { value: 'familias', label: 'Familias' },
  { value: 'estudiantes', label: 'Estudiantes' },
  { value: 'docentes', label: 'Docentes' },
  { value: 'comunidad', label: 'Comunidad educativa' },
]

export function destinatarioLabel(destinatario: Destinatario) {
  return DESTINATARIOS.find((d) => d.value === destinatario)?.label ?? destinatario
}

export type TipoRecurso = 'pdf' | 'video' | 'imagen'

export interface RecursoArchivo {
  nombre: string
  tipo: TipoRecurso
}

export type EstadoTaller = 'borrador' | 'publicado' | 'inactivo'

export interface Taller {
  id: string
  categoriaId: number
  titulo: string
  descripcion: string
  destinatarios: Destinatario[]
  etiquetas: string[]
  fecha: string
  responsable: string
  recursos: RecursoArchivo[]
  descargas: number
  estado: EstadoTaller
}
