import type { Tables, TablesInsert } from '@/shared/types/database'

export type Localidad = Tables<'localidad'>
export type Establecimiento = Tables<'establecimiento'>

/** Lo que edita el formulario. `cue` es `null` si se deja vacío. */
export type DatosEstablecimiento = Pick<TablesInsert<'establecimiento'>, 'nombre' | 'localidad_id'> & {
  cue: string | null
}

/** Cambios de una edición: los datos del formulario y la baja o reactivación (`activo`). */
export type CambiosEstablecimiento = Partial<DatosEstablecimiento & Pick<Establecimiento, 'activo'>>
