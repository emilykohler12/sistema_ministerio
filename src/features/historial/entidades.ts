import type { Database } from '@/shared/types/database'
import { filaDe } from './diff'
import type { Operacion } from './types'

type TablaAuditada = Exclude<keyof Database['public']['Tables'], 'registro_operacion'>

interface Entidad {
  /** Valor del filtro en la URL (`?entidad=`). */
  valor: string
  etiqueta: string
  /** Si el panel puede escribirla: Nivel, Localidad y Destinatario son solo SELECT y siempre darían vacío. */
  filtrable: boolean
}

const TALLER: Entidad = { valor: 'taller', etiqueta: 'Taller', filtrable: true }
const NORMATIVA: Entidad = { valor: 'normativa', etiqueta: 'Normativa', filtrable: true }

/**
 * Tabla física → entidad que ve el administrador. `satisfies` sobre las tablas de `database.ts`: una tabla nueva rompe el
 * typecheck hasta que se agregue acá (mismo criterio que las guardias globales de `supabase/tests/`).
 */
const ENTIDAD_DE_TABLA = {
  taller: TALLER,
  taller_destinatario: TALLER,
  taller_etiqueta: TALLER,
  normativa: NORMATIVA,
  normativa_etiqueta: NORMATIVA,
  categoria: { valor: 'categoria', etiqueta: 'Categoría', filtrable: true },
  recurso: { valor: 'recurso', etiqueta: 'Recurso', filtrable: true },
  establecimiento: { valor: 'establecimiento', etiqueta: 'Establecimiento', filtrable: true },
  etiqueta: { valor: 'etiqueta', etiqueta: 'Etiqueta', filtrable: true },
  configuracion: { valor: 'configuracion', etiqueta: 'Configuración', filtrable: true },
  registro_descarga: { valor: 'descarga', etiqueta: 'Descarga', filtrable: true },
  nivel_educativo: { valor: 'nivel', etiqueta: 'Nivel', filtrable: false },
  localidad: { valor: 'localidad', etiqueta: 'Localidad', filtrable: false },
  destinatario: { valor: 'destinatario', etiqueta: 'Destinatario', filtrable: false },
} satisfies Record<TablaAuditada, Entidad>

const TABLAS = Object.keys(ENTIDAD_DE_TABLA) as TablaAuditada[]

/** Etiqueta de la entidad de una tabla; una tabla que ya no existe (filas viejas) se muestra con su nombre físico. */
export function entidadDeTabla(tabla: string): string {
  return tabla in ENTIDAD_DE_TABLA ? ENTIDAD_DE_TABLA[tabla as TablaAuditada].etiqueta : tabla
}

export interface EntidadFiltrable {
  valor: string
  etiqueta: string
  tablas: string[]
}

export const ENTIDADES_FILTRABLES: EntidadFiltrable[] = TABLAS.reduce<EntidadFiltrable[]>((lista, tabla) => {
  const { valor, etiqueta, filtrable } = ENTIDAD_DE_TABLA[tabla]
  if (!filtrable) return lista
  const existente = lista.find((e) => e.valor === valor)
  if (existente) existente.tablas.push(tabla)
  else lista.push({ valor, etiqueta, tablas: [tabla] })
  return lista
}, [])

export function esEntidad(valor: string): boolean {
  return ENTIDADES_FILTRABLES.some((e) => e.valor === valor)
}

export function tablasDeEntidad(valor: string): string[] {
  return ENTIDADES_FILTRABLES.find((e) => e.valor === valor)?.tablas ?? []
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * Qué registro fue: nombre o título de `datos_nuevos ?? datos_anteriores` (en una baja solo existe el anterior), `#<registro_id>`
 * si no tiene, y en las puentes (sin `registro_id`) sus dos ids. Los nombres de lo referenciado quedan para #34.
 */
export function describir(op: Operacion): string {
  const fila = filaDe(op.datos_nuevos ?? op.datos_anteriores)
  if (op.registro_id === null) {
    return fila
      ? Object.entries(fila)
          .map(([columna, valor]) => `${columna} ${String(valor)}`)
          .join(' · ')
      : '—'
  }
  return texto(fila?.nombre) ?? texto(fila?.titulo) ?? `#${op.registro_id}`
}
