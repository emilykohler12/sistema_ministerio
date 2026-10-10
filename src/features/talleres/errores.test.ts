import { describe, expect, it } from 'vitest'
import { categoriaConTalleres, esCategoriaInactiva, esNombreDuplicado, mensajeDeError } from './errores'

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

describe('categoriaConTalleres', () => {
  it('con el código DA001 devuelve la cantidad que viene en details', () => {
    expect(categoriaConTalleres({ code: 'DA001', details: '3', message: 'x' })).toBe(3)
    expect(categoriaConTalleres({ code: 'DA001', details: '1' })).toBe(1)
  })

  it('con DA001 pero details null, vacío o que no es un entero positivo devuelve null', () => {
    for (const details of [null, undefined, '', ' ', 'abc', '0', '-2', '1.5', '1e3', 3]) {
      expect(categoriaConTalleres({ code: 'DA001', details })).toBeNull()
    }
    expect(categoriaConTalleres({ code: 'DA001' })).toBeNull()
  })

  it('con otro código devuelve null', () => {
    expect(categoriaConTalleres({ code: 'DA002', details: '3' })).toBeNull()
    expect(categoriaConTalleres({ code: '23505', details: '3' })).toBeNull()
  })

  it('con errores sin código, null, undefined o valores que no son objetos devuelve null', () => {
    expect(categoriaConTalleres(new Error('sin red'))).toBeNull()
    expect(categoriaConTalleres(null)).toBeNull()
    expect(categoriaConTalleres(undefined)).toBeNull()
    expect(categoriaConTalleres('DA001')).toBeNull()
  })
})

describe('esCategoriaInactiva', () => {
  it('es true con el código DA002', () => {
    expect(esCategoriaInactiva({ code: 'DA002', message: 'inactiva' })).toBe(true)
  })

  it('es false con otro código, incluido DA001', () => {
    expect(esCategoriaInactiva({ code: 'DA001', details: '2' })).toBe(false)
    expect(esCategoriaInactiva({ code: '23505' })).toBe(false)
  })

  it('es false con errores sin código, null, undefined o valores que no son objetos', () => {
    expect(esCategoriaInactiva(new Error('sin red'))).toBe(false)
    expect(esCategoriaInactiva(null)).toBe(false)
    expect(esCategoriaInactiva(undefined)).toBe(false)
    expect(esCategoriaInactiva('DA002')).toBe(false)
  })
})

describe('mensajeDeError', () => {
  const GENERICO = 'No pudimos guardar. Probá de nuevo.'

  it('DA001 informa la cantidad de talleres, en singular o plural', () => {
    expect(mensajeDeError({ code: 'DA001', details: '1' }, GENERICO)).toBe(
      'No se puede dar de baja: tiene 1 taller en borrador o publicado',
    )
    expect(mensajeDeError({ code: 'DA001', details: '3' }, GENERICO)).toBe(
      'No se puede dar de baja: tiene 3 talleres en borrador o publicados',
    )
  })

  it('DA002 avisa que la categoría está dada de baja', () => {
    expect(mensajeDeError({ code: 'DA002' }, GENERICO)).toBe('La categoría está dada de baja: reactivala primero')
  })

  it('cualquier otro error (o un DA001 sin cantidad válida) devuelve el mensaje genérico', () => {
    expect(mensajeDeError(new Error('sin red'), GENERICO)).toBe(GENERICO)
    expect(mensajeDeError({ code: '23505' }, GENERICO)).toBe(GENERICO)
    expect(mensajeDeError({ code: 'DA001', details: null }, GENERICO)).toBe(GENERICO)
    expect(mensajeDeError(null, GENERICO)).toBe(GENERICO)
  })
})
