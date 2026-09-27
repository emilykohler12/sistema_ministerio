import type { Nivel } from '@/features/talleres/types'

export type TipoNormativa = 'resolucion' | 'disposicion' | 'decreto'

export const TIPOS_NORMATIVA: { value: TipoNormativa; label: string }[] = [
  { value: 'resolucion', label: 'Resolución' },
  { value: 'disposicion', label: 'Disposición' },
  { value: 'decreto', label: 'Decreto' },
]

export interface Normativa {
  id: string
  tipo: TipoNormativa
  titulo: string
  descripcion: string
  numero: string
  fecha: string
  nivel: Nivel
  archivo: string
  responsable: string
  descargas: number
}
