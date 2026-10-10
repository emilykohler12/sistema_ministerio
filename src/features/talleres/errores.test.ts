import { describe, expect, it } from 'vitest'
import { esNombreDuplicado } from './errores'

describe('esNombreDuplicado', () => {
  it('es true cuando el error trae el código 23505 (violación de unicidad)', () => {
    expect(esNombreDuplicado({ code: '23505', message: 'duplicate key' })).toBe(true)
  })

  it('es false con otro código de Postgres', () => {
    expect(esNombreDuplicado({ code: '23514', message: 'check' })).toBe(false)
    expect(esNombreDuplicado({ code: '42501', message: 'rls' })).toBe(false)
  })

  it('es false con errores sin código, null, undefined o valores que no son objetos', () => {
    expect(esNombreDuplicado(new Error('sin red'))).toBe(false)
    expect(esNombreDuplicado(null)).toBe(false)
    expect(esNombreDuplicado(undefined)).toBe(false)
    expect(esNombreDuplicado('23505')).toBe(false)
  })
})
