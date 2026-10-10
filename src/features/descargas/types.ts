import type { Recurso } from '@/features/recursos/types'
import type { Enums } from '@/shared/types/database'

/** `PADRON`: un establecimiento del padrón; `OTRA`: nombre escrito a mano; `SIN_INSTITUCION`: ninguna (derivado de la base). */
export type TipoInstitucion = Enums<'tipo_institucion'>

/** Lista del CHECK de `registro_descarga.cargo` (0010, 0015): "Otro" va al final y pide `cargo_otro`. Debe coincidir con la base. */
export const CARGOS = ['Director/a', 'Vicedirector/a', 'Secretario/a', 'Docente', 'Supervisor/a', 'Otro'] as const

export type Cargo = (typeof CARGOS)[number]

/**
 * Lo que el formulario entrega a `registrar_descarga`. Los opcionales admiten `null`: la RPC anula los que no corresponden
 * según su discriminador (`cargo_otro` fuera de "Otro", `institucion_otra` fuera de `OTRA`, `establecimiento_id` fuera de `PADRON`).
 */
export interface DatosDescarga {
  cargo: Cargo
  cargo_otro?: string | null
  localidad_id: number
  institucion_tipo: TipoInstitucion
  establecimiento_id?: number | null
  institucion_otra?: string | null
}

/** Un recurso del taller con la URL para abrirlo: firmada (1 h) si es un archivo, la propia si es un enlace externo. */
export interface EnlaceDescarga {
  recurso: Recurso
  url: string
}
