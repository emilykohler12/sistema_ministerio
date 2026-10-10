import type { Enums, Tables } from '@/shared/types/database'

export type Recurso = Tables<'recurso'>
export type TipoRecurso = Enums<'tipo_recurso'>

/** Etiqueta legible de cada tipo; `satisfies` obliga a cubrir todos los valores del enum. */
export const ETIQUETA_TIPO_RECURSO = {
  PDF: 'PDF',
  PPTX: 'PowerPoint',
  DOCX: 'Word',
  IMAGEN: 'Imagen',
  VIDEO: 'Video',
  ENLACE: 'Enlace',
} satisfies Record<TipoRecurso, string>

/** Columnas que el admin puede cambiar (el grant de UPDATE por columna de la base): nunca `taller_id`. */
export type CambiosRecurso = Partial<
  Pick<Recurso, 'nombre' | 'tipo' | 'ruta_archivo' | 'url' | 'tamanio_bytes' | 'orden'>
>
