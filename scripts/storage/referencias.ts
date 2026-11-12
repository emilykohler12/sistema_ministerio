// Arma las referencias de la limpieza de huérfanos (issue #28, #23) a partir de las filas ya leídas. Puro: no toca la base.
import type { Referencias } from './planificar.ts'

export interface FilasReferenciadas {
  /** `recurso`: los enlaces no tienen archivo. */
  recursos: { ruta_archivo: string | null }[]
  normativas: { ruta_archivo: string }[]
  /**
   * La fila única de `configuracion`; `logo_ruta` es nula si no hay logo. Quien la lee debe fallar si no existe: sin
   * ella no se sabe qué logo está en uso y todo el bucket `logo` pasaría por huérfano.
   */
  configuracion: { logo_ruta: string | null }
}

/** Una clave por bucket de Storage (`talleres`, `normativas`, `logo`) con las rutas que alguna fila referencia. */
export function armarReferencias({ recursos, normativas, configuracion }: FilasReferenciadas): Referencias {
  return {
    talleres: recursos.flatMap((r) => (r.ruta_archivo ? [r.ruta_archivo] : [])),
    normativas: normativas.map((n) => n.ruta_archivo),
    logo: configuracion.logo_ruta ? [configuracion.logo_ruta] : [],
  }
}
