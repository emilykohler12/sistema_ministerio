import { z } from 'zod'
import { CARGOS } from './types'

const TIPOS_INSTITUCION = ['PADRON', 'OTRA', 'SIN_INSTITUCION'] as const

const MAXIMO_CARGO_OTRO = 100
const MAXIMO_INSTITUCION_OTRA = 200

/**
 * Formulario de descarga, con los mismos límites que `registro_descarga`. Los campos que no corresponden al discriminador
 * (`cargo_otro` fuera de "Otro", `institucion_otra` fuera de `OTRA`, `establecimiento_id` fuera de `PADRON`) se aceptan:
 * son estado residual del formulario y la RPC los anula.
 */
export const esquemaDescarga = z
  .object({
    cargo: z.enum(CARGOS, { error: 'Elegí tu cargo' }),
    cargo_otro: z.string().trim().nullish(),
    localidad_id: z
      .number({ error: 'Elegí tu localidad' })
      .int('Elegí tu localidad')
      .positive('Elegí tu localidad'),
    institucion_tipo: z.enum(TIPOS_INSTITUCION, { error: 'Elegí tu institución' }),
    establecimiento_id: z.number().int().positive().nullish(),
    institucion_otra: z.string().trim().nullish(),
  })
  .superRefine((datos, ctx) => {
    if (datos.cargo === 'Otro') {
      const largo = datos.cargo_otro?.length ?? 0
      if (largo === 0) {
        ctx.addIssue({ code: 'custom', path: ['cargo_otro'], message: 'Ingresá tu cargo' })
      } else if (largo > MAXIMO_CARGO_OTRO) {
        ctx.addIssue({
          code: 'custom',
          path: ['cargo_otro'],
          message: `El cargo no puede superar los ${MAXIMO_CARGO_OTRO} caracteres`,
        })
      }
    }
    if (datos.institucion_tipo === 'OTRA') {
      const largo = datos.institucion_otra?.length ?? 0
      if (largo === 0) {
        ctx.addIssue({ code: 'custom', path: ['institucion_otra'], message: 'Ingresá el nombre de la institución' })
      } else if (largo > MAXIMO_INSTITUCION_OTRA) {
        ctx.addIssue({
          code: 'custom',
          path: ['institucion_otra'],
          message: `El nombre no puede superar los ${MAXIMO_INSTITUCION_OTRA} caracteres`,
        })
      }
    }
    if (datos.institucion_tipo === 'PADRON' && datos.establecimiento_id == null) {
      ctx.addIssue({ code: 'custom', path: ['establecimiento_id'], message: 'Elegí tu institución' })
    }
  })
