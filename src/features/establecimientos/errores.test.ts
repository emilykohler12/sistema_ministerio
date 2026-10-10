import { describe, expect, it } from 'vitest'
import { esCueDuplicado, esNombreDuplicado } from './errores'

/*
 * Contrato de src/features/establecimientos/errores.ts (puro, sin imports de supabase; criterios 3, 4 y 6).
 * PostgREST no expone constraint_name: el nombre de la constraint viaja entre comillas dentro de `message`.
 *   esNombreDuplicado(error: unknown): boolean   // 23505 con "establecimiento_localidad_nombre_uniq" en message
 *   esCueDuplicado(error: unknown): boolean      // 23505 con "establecimiento_cue_key" en message
 * Un 23505 de otra constraint no es ninguno de los dos (el formulario muestra el error general).
 */
const MSG_NOMBRE = 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"'
const MSG_CUE = 'duplicate key value violates unique constraint "establecimiento_cue_key"'
const MSG_OTRA = 'duplicate key value violates unique constraint "otra_tabla_key"'

describe('esNombreDuplicado', () => {
  it('es true con 23505 cuyo mensaje nombra el índice (localidad, nombre)', () => {
    expect(esNombreDuplicado({ code: '23505', message: MSG_NOMBRE })).toBe(true)
  })

  it('es false con el 23505 del CUE o de una constraint desconocida', () => {
    expect(esNombreDuplicado({ code: '23505', message: MSG_CUE })).toBe(false)
    expect(esNombreDuplicado({ code: '23505', message: MSG_OTRA })).toBe(false)
  })

  it('es false sin el código 23505, aunque el mensaje nombre la constraint', () => {
    expect(esNombreDuplicado({ code: '23514', message: MSG_NOMBRE })).toBe(false)
    expect(esNombreDuplicado({ message: MSG_NOMBRE })).toBe(false)
  })

  it('es false con 23505 sin mensaje, null, undefined o valores que no son objetos', () => {
    expect(esNombreDuplicado({ code: '23505' })).toBe(false)
    expect(esNombreDuplicado({ code: '23505', message: 42 })).toBe(false)
    expect(esNombreDuplicado(new Error('sin red'))).toBe(false)
    expect(esNombreDuplicado(null)).toBe(false)
    expect(esNombreDuplicado(undefined)).toBe(false)
    expect(esNombreDuplicado('23505')).toBe(false)
  })
})

describe('esCueDuplicado', () => {
  it('es true con 23505 cuyo mensaje nombra establecimiento_cue_key', () => {
    expect(esCueDuplicado({ code: '23505', message: MSG_CUE })).toBe(true)
  })

  it('es false con el 23505 del nombre o de una constraint desconocida', () => {
    expect(esCueDuplicado({ code: '23505', message: MSG_NOMBRE })).toBe(false)
    expect(esCueDuplicado({ code: '23505', message: MSG_OTRA })).toBe(false)
  })

  it('es false sin el código 23505, sin mensaje o con valores que no son objetos', () => {
    expect(esCueDuplicado({ code: '23514', message: MSG_CUE })).toBe(false)
    expect(esCueDuplicado({ code: '23505' })).toBe(false)
    expect(esCueDuplicado(null)).toBe(false)
    expect(esCueDuplicado(undefined)).toBe(false)
    expect(esCueDuplicado(new Error('sin red'))).toBe(false)
  })
})
